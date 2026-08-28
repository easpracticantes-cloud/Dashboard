package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.dashboard.sheets.SeguimientoWhatsappDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetsDashboardDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.ToqueDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.VentaDto;
import com.escuelaaves.sig.application.dto.integration.SheetsSyncResultDto;
import com.escuelaaves.sig.application.service.sheets.SheetsPayloadMapper;
import com.escuelaaves.sig.domain.model.ChannelType;
import com.escuelaaves.sig.domain.model.ClientSegment;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import com.escuelaaves.sig.domain.model.MessageDirection;
import com.escuelaaves.sig.domain.model.MessageStatus;
import com.escuelaaves.sig.domain.model.NotificationType;
import com.escuelaaves.sig.domain.model.SenderType;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import com.escuelaaves.sig.domain.port.out.NotificationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.GoogleSheetsPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.NotificationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.QuoteEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ReservationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SaleEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.QuoteJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.ReservationJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.SaleJpaRepository;
import com.escuelaaves.sig.infrastructure.cache.TtlCacheService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Lee el Web App de Apps Script, cachea el dashboard y proyecta los datos
 * a las entidades CRM (clientes, conversaciones, mensajes, comercial).
 */
@Slf4j
@Service
public class SheetsSyncService {

    private static final ZoneId ZONE = ZoneId.of("America/Bogota");
    private static final Duration CACHE_TTL = Duration.ofMinutes(8);
    private static final String DEFAULT_WEBAPP_URL =
            "https://script.google.com/macros/s/AKfycbzMkCg7PfddRA048GAZBc5jz_2lKpmtJg13589XteWmONKBiQBQLKZxw-eBeEwa0uDslw/exec";
    private static final int MAX_HOT_NOTIFICATIONS = 20;
    private static final int MAX_QUOTE_SUGGESTIONS = 15;
    /** Lotes CRM: balance entre velocidad y presión de memoria/TX en Render. */
    private static final int CRM_BATCH_SIZE = 80;

    private final GoogleSheetsPort googleSheetsPort;
    private final SystemSettingRepositoryPort systemSettingRepositoryPort;
    private final ClientRepositoryPort clientRepositoryPort;
    private final ConversationRepositoryPort conversationRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;
    private final NotificationRepositoryPort notificationRepositoryPort;
    private final UserRepositoryPort userRepositoryPort;
    private final QuoteJpaRepository quoteJpaRepository;
    private final ReservationJpaRepository reservationJpaRepository;
    private final SaleJpaRepository saleJpaRepository;
    private final SheetsPayloadMapper sheetsPayloadMapper;
    private final TransactionTemplate transactionTemplate;
    private final Executor sheetsSyncExecutor;
    private final TtlCacheService ttlCacheService;

    @Value("${app.sheets.webapp-url:}")
    private String configuredWebAppUrl;

    private final AtomicReference<CacheEntry> dashboardCache = new AtomicReference<>();
    private final AtomicBoolean syncRunning = new AtomicBoolean(false);

    public SheetsSyncService(
            GoogleSheetsPort googleSheetsPort,
            SystemSettingRepositoryPort systemSettingRepositoryPort,
            ClientRepositoryPort clientRepositoryPort,
            ConversationRepositoryPort conversationRepositoryPort,
            MessageRepositoryPort messageRepositoryPort,
            NotificationRepositoryPort notificationRepositoryPort,
            UserRepositoryPort userRepositoryPort,
            QuoteJpaRepository quoteJpaRepository,
            ReservationJpaRepository reservationJpaRepository,
            SaleJpaRepository saleJpaRepository,
            SheetsPayloadMapper sheetsPayloadMapper,
            PlatformTransactionManager transactionManager,
            @Qualifier("sheetsSyncExecutor") Executor sheetsSyncExecutor,
            TtlCacheService ttlCacheService
    ) {
        this.googleSheetsPort = googleSheetsPort;
        this.systemSettingRepositoryPort = systemSettingRepositoryPort;
        this.clientRepositoryPort = clientRepositoryPort;
        this.conversationRepositoryPort = conversationRepositoryPort;
        this.messageRepositoryPort = messageRepositoryPort;
        this.notificationRepositoryPort = notificationRepositoryPort;
        this.userRepositoryPort = userRepositoryPort;
        this.quoteJpaRepository = quoteJpaRepository;
        this.reservationJpaRepository = reservationJpaRepository;
        this.saleJpaRepository = saleJpaRepository;
        this.sheetsPayloadMapper = sheetsPayloadMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.sheetsSyncExecutor = sheetsSyncExecutor;
        this.ttlCacheService = ttlCacheService;
    }

    /**
     * Endpoint de dashboard: sirve ÚNICAMENTE la última proyección en caché (PostgreSQL/sync).
     * Nunca consulta Google Sheets en el request HTTP.
     * {@code refresh} se ignora para no disparar Google desde navegación; use POST /integrations/sheets/sync.
     */
    public SheetsDashboardDto getDashboardSheets(boolean forceRefresh) {
        return getDashboardSheets(forceRefresh, false, false);
    }

    public SheetsDashboardDto getDashboardSheets(boolean forceRefresh, boolean includeRaw) {
        return getDashboardSheets(forceRefresh, includeRaw, false);
    }

    public SheetsDashboardDto getDashboardSheets(boolean forceRefresh, boolean includeRaw, boolean summary) {
        if (forceRefresh) {
            log.info("[SHEETS-SYNC] Dashboard ?refresh=true ignorado en HTTP (sync solo bootstrap/cron/manual)");
        }

        CacheEntry cached = dashboardCache.get();
        if (cached != null) {
            maybeHealLaggingCrm(cached.dto());
            SheetsDashboardDto dto = sheetsPayloadMapper.withCacheFlag(cached.dto(), true);
            if (summary) {
                return sheetsPayloadMapper.summaryOnly(dto);
            }
            return includeRaw ? dto : sheetsPayloadMapper.withoutRawMatrices(dto);
        }

        log.info("[SHEETS-SYNC] Dashboard sin caché → sync async (sin bloquear HTTP / sin Google en request)");
        sheetsSyncExecutor.execute(() -> {
            try {
                syncNow();
            } catch (Exception ex) {
                log.warn("[SHEETS-SYNC] Carga inicial async falló: {}", ex.getMessage());
            }
        });

        return sheetsPayloadMapper.empty(
                false,
                "Sincronizacion Sheets en curso. El panel se actualizara automaticamente al finalizar."
        );
    }

    /**
     * Sincronizacion bloqueante (bootstrap / cron). Persiste CRM por lotes.
     */
    public SheetsSyncResultDto syncNow() {
        return syncInternal(true);
    }

    /**
     * Para HTTP en Render: lee Sheets y proyecta CRM en segundo plano
     * (evita el corte de ~30s del proxy).
     */
    public SheetsSyncResultDto syncNowAsync() {
        return syncInternal(false);
    }

    private SheetsDashboardDto loadAndCache(boolean forceRefresh) {
        if (!isEnabled()) {
            return sheetsPayloadMapper.empty(false, "Google Sheets esta deshabilitado en configuracion.");
        }

        String webAppUrl = resolveWebAppUrl();
        if (webAppUrl.isBlank()) {
            return sheetsPayloadMapper.empty(false, "Configura integrations.googleSheets.webAppUrl.");
        }

        if (!forceRefresh) {
            CacheEntry cached = dashboardCache.get();
            if (cached != null && !cached.isExpired()) {
                return sheetsPayloadMapper.withCacheFlag(cached.dto(), true);
            }
        }

        long fetchStart = System.nanoTime();
        Optional<JsonNode> raw = googleSheetsPort.fetchDashboardRaw(webAppUrl);
        long fetchMs = (System.nanoTime() - fetchStart) / 1_000_000;
        log.info("[SHEETS-SYNC] HTTP Google Sheets fetchMs={} ok={}", fetchMs, raw.isPresent());
        if (raw.isEmpty()) {
            CacheEntry stale = dashboardCache.get();
            if (stale != null) {
                log.warn("No se pudo refrescar Sheets; se sirve cache anterior.");
                return sheetsPayloadMapper.withCacheFlag(stale.dto(), true);
            }
            return sheetsPayloadMapper.empty(false, "No se pudo obtener datos del Web App de Google Sheets.");
        }

        long mapStart = System.nanoTime();
        SheetsDashboardDto mapped = sheetsPayloadMapper.map(raw.get(), Instant.now(), false);
        long mapMs = (System.nanoTime() - mapStart) / 1_000_000;
        long rawDeclared = mapped.rawSheets() == null ? 0
                : mapped.rawSheets().stream().mapToLong(s -> s.rawRowCount()).sum();
        long rawMatrix = mapped.rawSheets() == null ? 0
                : mapped.rawSheets().stream().mapToLong(s -> s.fullData() != null ? s.fullData().size() : 0).sum();
        log.info(
                "[SHEETS-SYNC] Mapped: seguimiento={} ventas={} toques={} hojas={} rawRowCountSum={} matrixRowsSum={} mapMs={} success={}",
                mapped.seguimientoWhatsapp().size(),
                mapped.ventas() != null ? mapped.ventas().size() : 0,
                mapped.toques() != null ? mapped.toques().size() : 0,
                mapped.meta() != null ? mapped.meta().totalHojas() : 0,
                rawDeclared,
                rawMatrix,
                mapMs,
                mapped.success()
        );
        dashboardCache.set(new CacheEntry(mapped, Instant.now()));
        return mapped;
    }

    private SheetsSyncResultDto syncInternal(boolean waitForPersist) {
        if (!isEnabled()) {
            return new SheetsSyncResultDto(false, "Google Sheets esta deshabilitado en configuracion.", 0, 0, 0, Instant.now().toString());
        }

        if (!syncRunning.compareAndSet(false, true)) {
            log.info("Sheets sync omitida: ya hay una sincronizacion en curso");
            return new SheetsSyncResultDto(
                    true,
                    "Sincronizacion ya en curso",
                    0,
                    (int) Math.min(clientRepositoryPort.count(), Integer.MAX_VALUE),
                    (int) Math.min(conversationRepositoryPort.count(), Integer.MAX_VALUE),
                    Instant.now().toString()
            );
        }

        try {
            SheetsDashboardDto dashboard = loadAndCache(true);
            int rows = dashboard.seguimientoWhatsapp().size();
            if (!dashboard.success() && rows == 0) {
                syncRunning.set(false);
                return new SheetsSyncResultDto(false, dashboard.message(), 0, 0, 0, Instant.now().toString());
            }

            if (waitForPersist) {
                try {
                    persistCrmBatched(dashboard);
                } catch (Exception ex) {
                    log.warn("Fallo proyeccion CRM desde Sheets: {}", ex.getMessage());
                    return new SheetsSyncResultDto(
                            false,
                            "Datos Sheets OK; CRM parcial: " + ex.getMessage(),
                            rows,
                            (int) Math.min(clientRepositoryPort.count(), Integer.MAX_VALUE),
                            (int) Math.min(conversationRepositoryPort.count(), Integer.MAX_VALUE),
                            Instant.now().toString()
                    );
                } finally {
                    syncRunning.set(false);
                }
                long clients = clientRepositoryPort.count();
                long conversations = conversationRepositoryPort.count();
                log.info("Sheets sync CRM: {} filas, {} clientes, {} conversaciones en DB", rows, clients, conversations);
                return new SheetsSyncResultDto(
                        true,
                        "Sincronizacion CRM completada desde Google Sheets",
                        rows,
                        (int) Math.min(clients, Integer.MAX_VALUE),
                        (int) Math.min(conversations, Integer.MAX_VALUE),
                        Instant.now().toString()
                );
            }

            sheetsSyncExecutor.execute(() -> {
                try {
                    persistCrmBatched(dashboard);
                    log.info(
                            "Sheets async CRM OK: filas={}, clientes={}, conversaciones={}",
                            rows,
                            clientRepositoryPort.count(),
                            conversationRepositoryPort.count()
                    );
                } catch (Exception ex) {
                    log.warn("Sheets async CRM fallo: {}", ex.getMessage());
                } finally {
                    syncRunning.set(false);
                }
            });

            return new SheetsSyncResultDto(
                    true,
                    "Sincronizacion CRM en segundo plano iniciada",
                    rows,
                    (int) Math.min(clientRepositoryPort.count(), Integer.MAX_VALUE),
                    (int) Math.min(conversationRepositoryPort.count(), Integer.MAX_VALUE),
                    Instant.now().toString()
            );
        } catch (RuntimeException ex) {
            syncRunning.set(false);
            throw ex;
        }
    }

    /**
     * Si Sheets tiene filas en caché pero PostgreSQL está vacío o claramente atrasado,
     * dispara proyección CRM en background.
     */
    private void maybeHealEmptyCrm(SheetsDashboardDto dto) {
        maybeHealLaggingCrm(dto);
    }

    private void maybeHealLaggingCrm(SheetsDashboardDto dto) {
        if (dto == null || dto.seguimientoWhatsapp() == null || dto.seguimientoWhatsapp().isEmpty()) {
            return;
        }
        long sheetRows = dto.seguimientoWhatsapp().size();
        long dbConversations = conversationRepositoryPort.count();
        long dbClients = clientRepositoryPort.count();
        boolean empty = dbClients == 0;
        // Si hay mucho menos en DB que en Sheets (p.ej. sync cortada en Render), reintentar.
        boolean lagging = sheetRows >= 20 && dbConversations < Math.max(15, (long) (sheetRows * 0.85));
        if (!empty && !lagging) {
            return;
        }
        if (!syncRunning.compareAndSet(false, true)) {
            return;
        }
        log.warn(
                "[SHEETS-SYNC] Heal CRM: sheetRows={} dbClients={} dbConversations={} empty={} lagging={}",
                sheetRows, dbClients, dbConversations, empty, lagging
        );
        sheetsSyncExecutor.execute(() -> {
            try {
                persistCrmBatched(dto);
                log.info(
                        "[SHEETS-SYNC] Heal CRM OK: clientes={}, conversaciones={}",
                        clientRepositoryPort.count(),
                        conversationRepositoryPort.count()
                );
            } catch (Exception ex) {
                log.warn("[SHEETS-SYNC] Heal CRM fallo: {}", ex.getMessage());
            } finally {
                syncRunning.set(false);
            }
        });
    }

    @Scheduled(fixedDelayString = "${app.sheets.sync-interval-ms:300000}")
    public void scheduledSync() {
        if (!isEnabled()) {
            return;
        }
        try {
            syncNow();
        } catch (Exception ex) {
            log.warn("Fallo la sincronizacion programada de Google Sheets: {}", ex.getMessage());
        }
    }

    private void persistCrmBatched(SheetsDashboardDto dashboard) {
        List<SeguimientoWhatsappDto> rows = dashboard.seguimientoWhatsapp() != null
                ? dashboard.seguimientoWhatsapp()
                : List.of();
        SyncCounters counters = new SyncCounters();
        UserEntity admin = userRepositoryPort.findByUsername("admin").orElse(null);
        AtomicInteger hotNotified = new AtomicInteger();
        AtomicInteger quoteAsks = new AtomicInteger();
        AtomicInteger skippedNoPhone = new AtomicInteger();
        AtomicInteger errors = new AtomicInteger();
        long t0 = System.nanoTime();

        log.info("[SHEETS-SYNC] ========== SHEETS SYNC CRM BEGIN ==========");
        log.info("[SHEETS-SYNC] Filas seguimiento a persistir: {}", rows.size());
        if (dashboard.rawSheets() != null) {
            for (var sheet : dashboard.rawSheets()) {
                int matrixRows = sheet.fullData() != null ? sheet.fullData().size() : 0;
                log.info(
                        "[SHEETS-SYNC] Hoja '{}' rawRowCount={} matrixRows={}",
                        sheet.nombre(),
                        sheet.rawRowCount(),
                        matrixRows
                );
            }
        }

        for (int from = 0; from < rows.size(); from += CRM_BATCH_SIZE) {
            int to = Math.min(from + CRM_BATCH_SIZE, rows.size());
            List<SeguimientoWhatsappDto> batch = List.copyOf(rows.subList(from, to));
            long batchStart = System.nanoTime();
            try {
                transactionTemplate.executeWithoutResult(status ->
                        persistSeguimientoBatch(batch, counters, admin, hotNotified, quoteAsks, skippedNoPhone)
                );
                log.info(
                        "[SHEETS-SYNC] Batch {}-{} OK ({} filas, {} ms)",
                        from,
                        to,
                        batch.size(),
                        (System.nanoTime() - batchStart) / 1_000_000
                );
            } catch (Exception batchEx) {
                log.warn("[SHEETS-SYNC] Batch {}-{} fallo (reintento fila a fila): {}", from, to, batchEx.getMessage());
                for (SeguimientoWhatsappDto row : batch) {
                    try {
                        transactionTemplate.executeWithoutResult(status ->
                                persistSeguimientoBatch(List.of(row), counters, admin, hotNotified, quoteAsks, skippedNoPhone)
                        );
                    } catch (Exception rowEx) {
                        errors.incrementAndGet();
                        log.warn(
                                "[SHEETS-SYNC] Fila omitida celular={} hoja={}: {}",
                                row.celular(),
                                row.hojaOrigen(),
                                rowEx.getMessage()
                        );
                    }
                }
            }
        }

        try {
            transactionTemplate.executeWithoutResult(status -> {
                persistToques(dashboard.toques(), counters);
                pruneStaleSheetQuotes(counters);
                if (admin != null && !rows.isEmpty()) {
                    createSummaryNotification(admin, rows.size(), counters);
                }
            });
        } catch (Exception ex) {
            log.warn("[SHEETS-SYNC] post-CRM (toques/prune/notificacion) fallo: {}", ex.getMessage());
        }

        long elapsedMs = (System.nanoTime() - t0) / 1_000_000;
        long clientsDb = clientRepositoryPort.count();
        long conversationsDb = conversationRepositoryPort.count();
        int sheetsProcessed = dashboard.rawSheets() != null ? dashboard.rawSheets().size() : 0;
        log.info("[SHEETS-SYNC] ========== SHEETS SYNC ==========");
        log.info("[SHEETS-SYNC] Sheets procesadas: {}", sheetsProcessed);
        log.info("[SHEETS-SYNC] Filas leídas (seguimiento): {}", rows.size());
        log.info("[SHEETS-SYNC] Insertadas/actualizadas (conteo upsert ops): clientes≈{} conversaciones≈{} cotizaciones≈{} ventas≈{}",
                counters.clients, counters.conversations, counters.quotes, counters.sales);
        log.info("[SHEETS-SYNC] Filas sin celular (persistidas con teléfono sintético): {}", skippedNoPhone.get());
        log.info("[SHEETS-SYNC] Errores de fila: {}", errors.get());
        log.info("[SHEETS-SYNC] Totales PostgreSQL: clientes={} conversaciones={}", clientsDb, conversationsDb);
        log.info("[SHEETS-SYNC] Tiempo total: {} ms ({} s)", elapsedMs, String.format(Locale.ROOT, "%.1f", elapsedMs / 1000.0));
        logSheetVsPostgresVerification(dashboard, rows);
        log.info("[SHEETS-SYNC] =================================");
        ttlCacheService.invalidateAll();
    }

    /**
     * Compara filas de Google Sheets vs PostgreSQL por hoja y en total.
     */
    private void logSheetVsPostgresVerification(SheetsDashboardDto dashboard, List<SeguimientoWhatsappDto> rows) {
        log.info("[SHEETS-SYNC] ----- VERIFICACIÓN Google vs PostgreSQL -----");
        Map<String, Long> typedByHoja = new HashMap<>();
        for (SeguimientoWhatsappDto row : rows) {
            String hoja = blankToEmpty(row.hojaOrigen());
            if (hoja.isBlank()) {
                hoja = "(sin-hoja)";
            }
            typedByHoja.merge(hoja, 1L, Long::sum);
        }

        boolean allOk = true;
        if (dashboard.rawSheets() != null) {
            for (var sheet : dashboard.rawSheets()) {
                String name = sheet.nombre();
                long googleRows = sheet.rawRowCount();
                long matrixRows = sheet.fullData() != null ? sheet.fullData().size() : 0;
                long effectiveGoogle = googleRows > 0 ? googleRows : matrixRows;
                long typed = typedByHoja.getOrDefault(name, 0L);
                long pgByCategory = conversationRepositoryPort.countByCategory(name);
                // Tolerancia: tipado/dedupe puede ser menor que raw (headers, vacíos, dupes).
                boolean ok = pgByCategory >= typed
                        && (typed == 0 || effectiveGoogle == 0 || typed <= effectiveGoogle + 5);
                if (!ok) {
                    allOk = false;
                }
                log.info("[SHEETS-SYNC] Hoja: {}", name);
                log.info("[SHEETS-SYNC] Filas en Google: {} (matrix={})", effectiveGoogle, matrixRows);
                log.info("[SHEETS-SYNC] Filas tipadas (mapper): {}", typed);
                log.info("[SHEETS-SYNC] Filas en PostgreSQL (category): {}", pgByCategory);
                log.info("[SHEETS-SYNC] Estado: {}", ok ? "OK" : "ERROR");
            }
        }

        long googleSeguimiento = rows.size();
        long pgSheetsConv = conversationRepositoryPort.countByExternalKeyStartingWith("sheets-");
        boolean totalOk = googleSeguimiento == 0 || Math.abs(pgSheetsConv - googleSeguimiento) <= Math.max(5, googleSeguimiento / 20);
        if (!totalOk) {
            allOk = false;
        }
        log.info("[SHEETS-SYNC] Hoja: __TOTAL_SEGUIMIENTO__");
        log.info("[SHEETS-SYNC] Filas en Google: {}", googleSeguimiento);
        log.info("[SHEETS-SYNC] Filas en PostgreSQL: {}", pgSheetsConv);
        log.info("[SHEETS-SYNC] Estado: {}", totalOk ? "OK" : "ERROR");
        log.info("[SHEETS-SYNC] Verificación global: {}", allOk ? "OK" : "ERROR");
    }

    private void persistSeguimientoBatch(
            List<SeguimientoWhatsappDto> rows,
            SyncCounters counters,
            UserEntity admin,
            AtomicInteger hotNotified,
            AtomicInteger quoteAsks,
            AtomicInteger skippedNoPhone
    ) {
        for (SeguimientoWhatsappDto row : rows) {
            String phone = resolvePersistPhone(row);
            if (phone.startsWith("sintel-")) {
                // Contabilizar; aún así se persiste con teléfono sintético para no perder el chat.
                skippedNoPhone.incrementAndGet();
            }

            ClientEntity client = upsertClient(row, phone);
            counters.clients++;

            ConversationEntity conversation = upsertConversation(client, row);
            counters.conversations++;

            boolean newInbound = ensureMessages(conversation, row);
            upsertCommercial(client, row, counters);

            if (admin != null
                    && hotNotified.get() < MAX_HOT_NOTIFICATIONS
                    && "CALIENTE".equalsIgnoreCase(blankToEmpty(row.semaforo()))) {
                createHotLeadNotification(admin, client, conversation);
                hotNotified.incrementAndGet();
            }

            if (admin != null
                    && newInbound
                    && quoteAsks.get() < MAX_QUOTE_SUGGESTIONS
                    && !row.cotizado()
                    && !"VENTA".equalsIgnoreCase(blankToEmpty(row.semaforo()))) {
                createQuoteSuggestionNotification(admin, client, conversation);
                quoteAsks.incrementAndGet();
            }
        }
    }

    private void persistToques(List<ToqueDto> toques, SyncCounters counters) {
        if (toques == null || toques.isEmpty()) {
            return;
        }
        for (ToqueDto toque : toques) {
            String phone = normalizePhone(blankToEmpty(toque.telefono()));
            if (phone.isBlank()) {
                continue;
            }
            String name = blankToEmpty(toque.agencia());
            if (name.isBlank()) {
                name = blankToEmpty(toque.asesor());
            }
            if (name.isBlank()) {
                name = phone;
            }
            final String resolvedName = name;
            ClientEntity client = clientRepositoryPort.findFirstByPhone(phone)
                    .or(() -> clientRepositoryPort.findByPhone(phone))
                    .orElseGet(() -> ClientEntity.builder()
                            .phone(phone)
                            .name(resolvedName)
                            .segment(ClientSegment.VIP)
                            .source("Google Sheets · TOQUES")
                            .tags(new HashSet<>())
                            .build());
            client.setName(resolvedName);
            client.setPhone(phone);
            client.setEmail(blankToEmpty(toque.correo()));
            client.setSource("Google Sheets · TOQUES");
            client.setSegment(ClientSegment.VIP);
            client.setNotes("Asesor: " + blankToEmpty(toque.asesor())
                    + "\nMedio: " + blankToEmpty(toque.medio()));
            Set<String> tags = client.getTags();
            if (tags == null) {
                tags = new HashSet<>();
                client.setTags(tags);
            }
            // Mutar la colección persistente (no reemplazarla) evita client_tags_pkey
            if (!blankToEmpty(toque.medio()).isBlank()) {
                tags.add(truncate(toque.medio().trim().toLowerCase(Locale.ROOT), 60));
            }
            tags.add("toques");
            tags.add("b2b");
            clientRepositoryPort.save(client);
            counters.clients++;
        }
    }

    private ClientEntity upsertClient(SeguimientoWhatsappDto row, String phone) {
        String resolvedName = blankToEmpty(row.cliente());
        if (resolvedName.isBlank()) {
            resolvedName = phone;
        }
        final String name = resolvedName;

        ClientEntity client = clientRepositoryPort.findFirstByPhone(phone)
                .or(() -> clientRepositoryPort.findByPhone(phone))
                .orElseGet(() -> ClientEntity.builder()
                .phone(phone)
                .name(name)
                .segment(ClientSegment.NUEVO)
                .source("Google Sheets")
                .tags(new HashSet<>())
                .build());

        client.setName(name);
        client.setPhone(phone);
        client.setLastContactAt(parseInstant(row.fecha()));
        client.setSource("Google Sheets");
        client.setSegment(mapSegment(row.semaforo()));
        if (!blankToEmpty(row.notas()).isBlank()) {
            client.setNotes(row.notas());
        }

        Set<String> tags = client.getTags();
        if (tags == null) {
            tags = new HashSet<>();
            client.setTags(tags);
        }
        if (!blankToEmpty(row.canal()).isBlank()) {
            tags.add(truncate(row.canal().trim().toLowerCase(Locale.ROOT), 60));
        }
        if (!blankToEmpty(row.tipo()).isBlank()) {
            tags.add(truncate(row.tipo().trim().toLowerCase(Locale.ROOT), 60));
        }
        if (row.encuesta()) {
            tags.add("encuesta");
        }
        if (row.cotizado()) {
            tags.add("cotizado");
        }
        return clientRepositoryPort.save(client);
    }

    private ConversationEntity upsertConversation(ClientEntity client, SeguimientoWhatsappDto row) {
        String key = externalKey(row);
        Instant at = parseInstant(row.fecha());
        ConversationEntity conversation = conversationRepositoryPort.findFirstByExternalKey(key)
                .or(() -> conversationRepositoryPort.findByExternalKey(key))
                .orElseGet(() -> ConversationEntity.builder()
                        .client(client)
                        .externalKey(key)
                        .channel(mapChannel(row.canal()))
                        .build());

        conversation.setClient(client);
        conversation.setExternalKey(key);
        conversation.setChannel(mapChannel(row.canal()));
        conversation.setStatus(mapStatus(row.semaforo()));
        conversation.setPriority(mapPriority(row.semaforo()));
        conversation.setImportance(mapImportanceScore(row.semaforo()));
        conversation.setCategory(truncate(firstNonBlank(blankToEmpty(row.hojaOrigen()), blankToEmpty(row.canal())), 80));
        conversation.setNotes(buildNotes(row));
        conversation.setLastMessagePreview(preview(row));
        conversation.setLastMessageAt(at);
        conversation.setUnreadCount(conversation.getId() == null ? 1 : conversation.getUnreadCount());

        Set<String> labels = conversation.getLabels();
        if (labels == null) {
            labels = new HashSet<>();
            conversation.setLabels(labels);
        }
        if (!blankToEmpty(row.semaforo()).isBlank()) {
            labels.add(truncate(row.semaforo().trim().toUpperCase(Locale.ROOT), 60));
        }
        if (!blankToEmpty(row.tipo()).isBlank()) {
            labels.add(truncate(row.tipo().trim().toUpperCase(Locale.ROOT), 60));
        }
        if (!blankToEmpty(row.hojaOrigen()).isBlank()) {
            labels.add(truncate(row.hojaOrigen().trim(), 60));
        }
        return conversationRepositoryPort.save(conversation);
    }

    private boolean ensureMessages(ConversationEntity conversation, SeguimientoWhatsappDto row) {
        List<MessageEntity> existing = messageRepositoryPort.findByConversationIdOrderBySentAtAsc(conversation.getId());
        if (!existing.isEmpty()) {
            return false;
        }

        Instant base = parseInstant(row.fecha());
        String solicitud = blankToEmpty(row.solicitud());
        String respuesta = blankToEmpty(row.respuesta());

        boolean inboundSeeded = false;
        if (!solicitud.isBlank()) {
            messageRepositoryPort.save(MessageEntity.builder()
                    .conversation(conversation)
                    .direction(MessageDirection.INBOUND)
                    .body(solicitud)
                    .status(MessageStatus.DELIVERED)
                    .senderType(SenderType.CLIENT)
                    .sentAt(base)
                    .build());
            inboundSeeded = true;
        }
        if (!respuesta.isBlank() && !isNoReply(respuesta)) {
            messageRepositoryPort.save(MessageEntity.builder()
                    .conversation(conversation)
                    .direction(MessageDirection.OUTBOUND)
                    .body(respuesta)
                    .status(MessageStatus.SENT)
                    .senderType(SenderType.AGENT)
                    .sentAt(base.plusSeconds(120))
                    .build());
        }
        return inboundSeeded;
    }

    private void upsertCommercial(ClientEntity client, SeguimientoWhatsappDto row, SyncCounters counters) {
        String key = externalKey(row).replace("sheets-", "");
        Instant at = parseInstant(row.fecha());
        LocalDate date = at.atZone(ZONE).toLocalDate();
        String rawTitle = blankToEmpty(row.solicitud());
        if (rawTitle.length() > 120) {
            rawTitle = rawTitle.substring(0, 117) + "...";
        }
        if (rawTitle.isBlank()) {
            rawTitle = "Seguimiento " + blankToEmpty(row.canal());
        }
        final String titleBase = rawTitle;

        if (row.cotizado()) {
            String code = "SHQ-" + key.substring(0, Math.min(12, key.length())).toUpperCase(Locale.ROOT);
            counters.seenQuoteCodes.add(code);

            Instant issuedInstant = resolveQuoteInstant(row);
            LocalDate issuedDate = issuedInstant != null
                    ? issuedInstant.atZone(ZONE).toLocalDate()
                    : null;

            BigDecimal amount = row.monto() != null ? row.monto() : BigDecimal.ZERO;
            if (amount.signum() <= 0) {
                amount = extractMoneyFromText(
                        blankToEmpty(row.notas()) + " "
                                + blankToEmpty(row.respuesta()) + " "
                                + blankToEmpty(row.solicitud()) + " "
                                + blankToEmpty(row.registrado())
                );
            }

            QuoteEntity quote = quoteJpaRepository.findByCode(code).orElseGet(() -> QuoteEntity.builder()
                    .code(code)
                    .client(client)
                    .title(titleBase)
                    .amount(BigDecimal.ZERO)
                    .currency("COP")
                    .status(CommercialStatus.SENT)
                    .build());
            quote.setClient(client);
            quote.setTitle(titleBase);
            quote.setDescription(blankToEmpty(row.notas()));
            // Siempre reflejar el monto extraído de Sheets (evita años/códigos viejos)
            quote.setAmount(amount != null ? amount : BigDecimal.ZERO);
            quote.setCurrency("COP");
            quote.setStatus(CommercialStatus.SENT);
            if (issuedDate != null) {
                quote.setValidUntil(issuedDate.plusDays(15));
                quote.setIssuedAt(issuedDate);
            }
            if (issuedInstant != null) {
                quote.setCreatedAt(issuedInstant);
            }
            quoteJpaRepository.save(quote);
            counters.quotes++;
        }

        LocalDate serviceDate = parseFlexibleDate(row.fechaServicio());
        if (serviceDate != null) {
            String code = "SHR-" + key.substring(0, Math.min(12, key.length())).toUpperCase(Locale.ROOT);
            if (reservationJpaRepository.findByCode(code).isEmpty()) {
                reservationJpaRepository.save(ReservationEntity.builder()
                        .code(code)
                        .client(client)
                        .experienceName(titleBase)
                        .partySize(1)
                        .reservationDate(serviceDate)
                        .amount(BigDecimal.ZERO)
                        .status(CommercialStatus.CONFIRMED)
                        .notes(blankToEmpty(row.notas()))
                        .build());
                counters.reservations++;
            }
        }

        if ("VENTA".equalsIgnoreCase(blankToEmpty(row.semaforo()))) {
            String code = "SHV-" + key.substring(0, Math.min(12, key.length())).toUpperCase(Locale.ROOT);
            if (saleJpaRepository.findByCode(code).isEmpty()) {
                saleJpaRepository.save(SaleEntity.builder()
                        .code(code)
                        .client(client)
                        .concept(titleBase)
                        .amount(BigDecimal.ZERO)
                        .currency("COP")
                        .saleDate(date)
                        .status(CommercialStatus.COMPLETED)
                        .paymentMethod("Sheets")
                        .build());
                counters.sales++;
            }
        }
    }

    private void createHotLeadNotification(UserEntity admin, ClientEntity client, ConversationEntity conversation) {
        String title = "Lead caliente: " + client.getName();
        boolean exists = notificationRepositoryPort.findByUserIdOrderByCreatedAtDesc(admin.getId()).stream()
                .limit(50)
                .anyMatch(n -> title.equals(n.getTitle()));
        if (exists) {
            return;
        }
        notificationRepositoryPort.save(NotificationEntity.builder()
                .user(admin)
                .title(title)
                .body("Contacto " + client.getPhone() + " marcado como CALIENTE en Google Sheets.")
                .type(NotificationType.WARNING)
                .link("/app/conversations/" + conversation.getId())
                .read(false)
                .build());
    }

    private void createQuoteSuggestionNotification(UserEntity admin, ClientEntity client, ConversationEntity conversation) {
        String title = "¿Quieres hacer la cotización? · " + client.getName();
        boolean exists = notificationRepositoryPort.findByUserIdOrderByCreatedAtDesc(admin.getId()).stream()
                .limit(60)
                .anyMatch(n -> title.equals(n.getTitle()));
        if (exists) {
            return;
        }
        notificationRepositoryPort.save(NotificationEntity.builder()
                .user(admin)
                .title(title)
                .body("Nuevo mensaje de " + client.getPhone()
                        + ". La IA puede analizar el chat y generar la cotización en PDF.")
                .type(NotificationType.MESSAGE)
                .link("/app/conversations/" + conversation.getId())
                .read(false)
                .build());
    }

    private void createSummaryNotification(UserEntity admin, int rows, SyncCounters counters) {
        String title = "Sheets sincronizado (" + Instant.now().atZone(ZONE).toLocalDate() + ")";
        boolean recent = notificationRepositoryPort.findByUserIdOrderByCreatedAtDesc(admin.getId()).stream()
                .limit(5)
                .anyMatch(n -> n.getTitle() != null && n.getTitle().startsWith("Sheets sincronizado")
                        && n.getCreatedAt() != null
                        && n.getCreatedAt().isAfter(Instant.now().minus(Duration.ofHours(1))));
        if (recent) {
            return;
        }
        notificationRepositoryPort.save(NotificationEntity.builder()
                .user(admin)
                .title(title)
                .body("Se proyectaron " + rows + " seguimientos a CRM ("
                        + counters.clients + " clientes, "
                        + counters.conversations + " conversaciones, "
                        + counters.quotes + " cotizaciones, "
                        + counters.sales + " ventas).")
                .type(NotificationType.SUCCESS)
                .link("/app/dashboard")
                .read(false)
                .build());
    }

    private String resolveWebAppUrl() {
        String fromSetting = setting("integrations.googleSheets.webAppUrl", "");
        if (!fromSetting.isBlank()) {
            return fromSetting.trim();
        }
        if (configuredWebAppUrl != null && !configuredWebAppUrl.isBlank()) {
            return configuredWebAppUrl.trim();
        }
        return DEFAULT_WEBAPP_URL;
    }

    private String resolvePersistPhone(SeguimientoWhatsappDto row) {
        String phone = normalizePhone(row.celular());
        if (!phone.isBlank()) {
            return phone;
        }
        // Conserva el chat aunque Sheets no traiga celular (antes se descartaba en silencio).
        String seed = String.join("|",
                blankToEmpty(row.cliente()),
                blankToEmpty(row.fecha()),
                blankToEmpty(row.solicitud()),
                blankToEmpty(row.hojaOrigen())
        );
        return "sintel-" + Integer.toHexString(seed.hashCode());
    }

    private String externalKey(SeguimientoWhatsappDto row) {
        // Misma fórmula histórica (compatibilidad con filas ya UPSERTeadas en PostgreSQL).
        String raw = String.join("|",
                resolvePersistPhone(row),
                blankToEmpty(row.fecha()),
                blankToEmpty(row.solicitud()),
                blankToEmpty(row.canal()),
                blankToEmpty(row.hojaOrigen())
        );
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            return "sheets-" + HexFormat.of().formatHex(hash).substring(0, 24);
        } catch (Exception ex) {
            return "sheets-" + Integer.toHexString(raw.hashCode());
        }
    }

    private ChannelType mapChannel(String canal) {
        String v = blankToEmpty(canal).toUpperCase(Locale.ROOT);
        if (v.contains("WHATS")) return ChannelType.WHATSAPP;
        if (v.contains("MAIL") || v.contains("CORREO")) return ChannelType.EMAIL;
        return ChannelType.WEB;
    }

    private ConversationStatus mapStatus(String semaforo) {
        String v = blankToEmpty(semaforo).toUpperCase(Locale.ROOT);
        if (v.contains("VENTA")) return ConversationStatus.RESOLVED;
        if (v.contains("CALIENTE")) return ConversationStatus.PENDING;
        if (v.contains("TIBIO")) return ConversationStatus.OPEN;
        if (v.contains("FRIO")) return ConversationStatus.OPEN;
        return ConversationStatus.OPEN;
    }

    private ConversationPriority mapPriority(String semaforo) {
        String v = blankToEmpty(semaforo).toUpperCase(Locale.ROOT);
        if (v.contains("VENTA") || v.contains("CALIENTE")) return ConversationPriority.URGENT;
        if (v.contains("TIBIO")) return ConversationPriority.HIGH;
        if (v.contains("FRIO")) return ConversationPriority.LOW;
        return ConversationPriority.MEDIUM;
    }

    private int mapImportanceScore(String semaforo) {
        return switch (mapPriority(semaforo)) {
            case URGENT -> 5;
            case HIGH -> 4;
            case MEDIUM -> 3;
            case LOW -> 2;
        };
    }

    private ClientSegment mapSegment(String semaforo) {
        String v = blankToEmpty(semaforo).toUpperCase(Locale.ROOT);
        if (v.contains("VENTA")) return ClientSegment.FRECUENTE;
        if (v.contains("CALIENTE")) return ClientSegment.VIP;
        return ClientSegment.NUEVO;
    }

    private String preview(SeguimientoWhatsappDto row) {
        String solicitud = blankToEmpty(row.solicitud());
        if (!solicitud.isBlank()) {
            return solicitud.length() > 480 ? solicitud.substring(0, 477) + "..." : solicitud;
        }
        return blankToEmpty(row.respuesta());
    }

    private String buildNotes(SeguimientoWhatsappDto row) {
        StringBuilder sb = new StringBuilder();
        if (!blankToEmpty(row.notas()).isBlank()) {
            sb.append(row.notas().trim());
        }
        if (!blankToEmpty(row.asignado()).isBlank()) {
            if (!sb.isEmpty()) sb.append('\n');
            sb.append("Asignado: ").append(row.asignado().trim());
        }
        if (!blankToEmpty(row.proximoSeguimiento()).isBlank()) {
            if (!sb.isEmpty()) sb.append('\n');
            sb.append("Proximo seguimiento: ").append(row.proximoSeguimiento().trim());
        }
        if (!blankToEmpty(row.respuesta()).isBlank()) {
            if (!sb.isEmpty()) sb.append('\n');
            sb.append("Respuesta Sheets: ").append(row.respuesta().trim());
        }
        return sb.toString();
    }

    private boolean isNoReply(String respuesta) {
        String v = respuesta.toUpperCase(Locale.ROOT);
        return v.contains("NO DIO") || v.contains("NO SE DIO") || v.contains("INCONCLUSA");
    }

    private Instant resolveQuoteInstant(SeguimientoWhatsappDto row) {
        String cot = blankToEmpty(row.fechaCotizado());
        if (looksLikeDateValue(cot)) {
            Instant parsed = parseInstantOrNull(cot);
            if (parsed != null) {
                return parsed;
            }
        }
        Instant fromFecha = parseInstantOrNull(blankToEmpty(row.fecha()));
        if (fromFecha != null) {
            return fromFecha;
        }
        return parseInstantOrNull(blankToEmpty(row.fechaServicio()));
    }

    private static boolean looksLikeDateValue(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String v = value.trim();
        if (v.equalsIgnoreCase("SI") || v.equalsIgnoreCase("NO") || v.equalsIgnoreCase("TRUE") || v.equalsIgnoreCase("FALSE")) {
            return false;
        }
        return parseFlexibleDateStatic(v) != null
                || (v.length() >= 10 && Character.isDigit(v.charAt(0)));
    }

    private Instant parseInstantOrNull(String fecha) {
        if (fecha == null || fecha.isBlank()) {
            return null;
        }
        // Preferir fecha calendario en America/Bogota (Sheets manda T00:00Z y en CO cae al día/año anterior).
        LocalDate d = parseFlexibleDate(fecha);
        if (d != null) {
            return LocalDateTime.of(d, LocalTime.NOON).atZone(ZONE).toInstant();
        }
        try {
            return Instant.parse(fecha.trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static LocalDate parseFlexibleDateStatic(String date) {
        if (date == null || date.isBlank()) {
            return null;
        }
        String value = date.trim();
        if (value.length() >= 10 && value.charAt(4) == '-') {
            try {
                return LocalDate.parse(value.substring(0, 10));
            } catch (DateTimeParseException ignored) {
            }
        }
        String[] patterns = {"yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy"};
        for (String pattern : patterns) {
            try {
                return LocalDate.parse(value, DateTimeFormatter.ofPattern(pattern));
            } catch (DateTimeParseException ignored) {
            }
        }
        return null;
    }

    private Instant parseInstant(String fecha) {
        Instant parsed = parseInstantOrNull(fecha);
        return parsed != null ? parsed : Instant.now();
    }

    private LocalDate parseFlexibleDate(String date) {
        return parseFlexibleDateStatic(date);
    }

    private void pruneStaleSheetQuotes(SyncCounters counters) {
        if (counters.seenQuoteCodes.isEmpty()) {
            return;
        }
        List<QuoteEntity> all = quoteJpaRepository.findAll();
        int removed = 0;
        for (QuoteEntity quote : all) {
            String code = quote.getCode();
            if (code != null && code.startsWith("SHQ-") && !counters.seenQuoteCodes.contains(code)) {
                quoteJpaRepository.delete(quote);
                removed++;
            }
        }
        if (removed > 0) {
            log.info("Cotizaciones Sheets obsoletas eliminadas: {}", removed);
        }
    }

    private String normalizePhone(String phone) {
        return phone.replaceAll("[^0-9+]", "");
    }

    private static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static BigDecimal extractMoneyFromText(String text) {
        if (text == null || text.isBlank()) {
            return BigDecimal.ZERO;
        }
        java.util.regex.Matcher moneyLike = java.util.regex.Pattern.compile(
                "\\$\\s*(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{2})?|\\d+[.,]\\d{2}|\\d{4,})"
        ).matcher(text);
        BigDecimal best = BigDecimal.ZERO;
        while (moneyLike.find()) {
            BigDecimal value = sanitizeMoneyToken(moneyLike.group(1));
            if (value.compareTo(best) > 0) {
                best = value;
            }
        }
        if (best.signum() > 0) {
            return best;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(
                "(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{2})?|\\d+[.,]\\d{2})"
        ).matcher(text);
        while (matcher.find()) {
            BigDecimal value = sanitizeMoneyToken(matcher.group(1));
            if (value.compareTo(best) > 0) {
                best = value;
            }
        }
        return best;
    }

    private static BigDecimal sanitizeMoneyToken(String token) {
        if (token == null || token.isBlank()) {
            return BigDecimal.ZERO;
        }
        String t = token.trim();
        if (t.matches("19\\d{2}|20\\d{2}") || t.matches("\\d{8}")) {
            return BigDecimal.ZERO;
        }
        try {
            if (t.matches("\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?")) {
                t = t.replace(".", "").replace(",", ".");
            } else if (t.matches("\\d{1,3}(,\\d{3})+(\\.\\d{1,2})?")) {
                t = t.replace(",", "");
            } else if (t.contains(",") && !t.contains(".")) {
                t = t.replace(",", ".");
            }
            BigDecimal value = new BigDecimal(t);
            if (value.compareTo(BigDecimal.valueOf(10_000)) < 0) {
                return BigDecimal.ZERO;
            }
            if (value.compareTo(BigDecimal.valueOf(500_000_000L)) > 0) {
                return BigDecimal.ZERO;
            }
            return value;
        } catch (Exception ex) {
            return BigDecimal.ZERO;
        }
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        if (b != null && !b.isBlank()) return b;
        return "";
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }

    private boolean isEnabled() {
        return "true".equalsIgnoreCase(setting("integrations.googleSheetsEnabled", "false"));
    }

    private String setting(String key, String fallback) {
        return systemSettingRepositoryPort.findBySettingKey(key)
                .map(s -> s.getSettingValue() != null ? s.getSettingValue() : fallback)
                .orElse(fallback);
    }

    /**
     * Actualiza una fila de seguimiento en el cache local tras escritura exitosa a Sheets.
     */
    public void patchSeguimientoRow(String hojaOrigen, String celular, String fecha, Map<String, Object> fields) {
        CacheEntry cached = dashboardCache.get();
        if (cached == null || cached.dto() == null || cached.dto().seguimientoWhatsapp() == null) {
            return;
        }
        String wantCel = digits(celular);
        String wantFecha = fecha == null ? "" : fecha.trim();
        if (wantFecha.length() > 10) wantFecha = wantFecha.substring(0, 10);
        String wantHoja = hojaOrigen == null ? "" : hojaOrigen.trim();

        List<SeguimientoWhatsappDto> next = new ArrayList<>(cached.dto().seguimientoWhatsapp().size());
        boolean found = false;
        for (SeguimientoWhatsappDto row : cached.dto().seguimientoWhatsapp()) {
            boolean matchCel = wantCel.isEmpty() || digits(row.celular()).equals(wantCel)
                    || digits(row.celular()).endsWith(wantCel) || wantCel.endsWith(digits(row.celular()));
            String rowFecha = row.fecha() == null ? "" : (row.fecha().length() >= 10 ? row.fecha().substring(0, 10) : row.fecha());
            boolean matchFecha = wantFecha.isEmpty() || rowFecha.equals(wantFecha) || rowFecha.startsWith(wantFecha);
            boolean matchHoja = wantHoja.isEmpty() || wantHoja.equalsIgnoreCase(nullToEmpty(row.hojaOrigen()));
            if (!found && matchCel && matchFecha && matchHoja) {
                next.add(mergeSeguimiento(row, fields));
                found = true;
            } else {
                next.add(row);
            }
        }
        if (!found) {
            return;
        }
        SheetsDashboardDto d = cached.dto();
        SheetsDashboardDto patched = new SheetsDashboardDto(
                d.meta(), d.kpis(), d.porSemaforo(), d.porCanal(), d.porHoja(), d.porMes(), d.evolucionMensual(),
                List.copyOf(next), d.ventas(), d.resumenPaises(), d.paisesDetalle(), d.hojas(), d.toques(),
                d.piezasPub(), d.b2bAgencias(), d.b2bTabla(), d.estadisticas(), d.despliegueSemanal(),
                d.planComercial(), d.rawSheets(), d.b2bStatus(), d.b2bMensaje(), d.success(), d.message()
        );
        dashboardCache.set(new CacheEntry(patched, cached.loadedAt()));
    }

    public void patchVentaRow(String hojaOrigen, String celular, String fechaCot, Map<String, Object> fields) {
        CacheEntry cached = dashboardCache.get();
        if (cached == null || cached.dto() == null || cached.dto().ventas() == null) {
            return;
        }
        String wantCel = digits(celular);
        String wantFecha = fechaCot == null ? "" : fechaCot.trim();
        if (wantFecha.length() > 10) wantFecha = wantFecha.substring(0, 10);

        List<VentaDto> next = new ArrayList<>(cached.dto().ventas().size());
        boolean found = false;
        for (VentaDto row : cached.dto().ventas()) {
            boolean matchCel = wantCel.isEmpty() || digits(row.celular()).equals(wantCel)
                    || digits(row.celular()).endsWith(wantCel) || wantCel.endsWith(digits(row.celular()));
            String rowFecha = row.fechaCot() == null ? "" : (row.fechaCot().length() >= 10 ? row.fechaCot().substring(0, 10) : row.fechaCot());
            boolean matchFecha = wantFecha.isEmpty() || rowFecha.equals(wantFecha);
            if (!found && matchCel && matchFecha) {
                next.add(mergeVenta(row, fields));
                found = true;
            } else {
                next.add(row);
            }
        }
        if (!found) {
            return;
        }
        SheetsDashboardDto d = cached.dto();
        SheetsDashboardDto patched = new SheetsDashboardDto(
                d.meta(), d.kpis(), d.porSemaforo(), d.porCanal(), d.porHoja(), d.porMes(), d.evolucionMensual(),
                d.seguimientoWhatsapp(), List.copyOf(next), d.resumenPaises(), d.paisesDetalle(), d.hojas(), d.toques(),
                d.piezasPub(), d.b2bAgencias(), d.b2bTabla(), d.estadisticas(), d.despliegueSemanal(),
                d.planComercial(), d.rawSheets(), d.b2bStatus(), d.b2bMensaje(), d.success(), d.message()
        );
        dashboardCache.set(new CacheEntry(patched, cached.loadedAt()));
    }

    private static SeguimientoWhatsappDto mergeSeguimiento(SeguimientoWhatsappDto row, Map<String, Object> fields) {
        return new SeguimientoWhatsappDto(
                pickStr(fields, "fecha", row.fecha()),
                pickStr(fields, "tipo", row.tipo()),
                pickStr(fields, "canal", row.canal()),
                pickStr(fields, "cliente", row.cliente()),
                pickStr(fields, "celular", row.celular()),
                pickStr(fields, "solicitud", row.solicitud()),
                pickStr(fields, "respuesta", row.respuesta()),
                pickStr(fields, "semaforo", row.semaforo()),
                pickBool(fields, "cotizado", row.cotizado()),
                pickStr(fields, "notas", row.notas()),
                pickStr(fields, "fechaServicio", row.fechaServicio()),
                pickBool(fields, "encuesta", row.encuesta()),
                pickStr(fields, "asignado", row.asignado()),
                pickStr(fields, "proximoSeguimiento", row.proximoSeguimiento()),
                pickStr(fields, "hojaOrigen", row.hojaOrigen()),
                pickStr(fields, "disc", row.disc()),
                pickStr(fields, "priorizar", row.priorizar()),
                pickStr(fields, "pendiente", row.pendiente()),
                pickStr(fields, "objecion", row.objecion()),
                pickStr(fields, "excelente", row.excelente()),
                pickStr(fields, "buena", row.buena()),
                pickStr(fields, "regular", row.regular()),
                pickStr(fields, "registrado", row.registrado()),
                pickStr(fields, "fechaCotizado", row.fechaCotizado()),
                row.monto()
        );
    }

    private static VentaDto mergeVenta(VentaDto row, Map<String, Object> fields) {
        return new VentaDto(
                pickStr(fields, "fechaCot", row.fechaCot()),
                pickStr(fields, "tipoCliente", row.tipoCliente()),
                pickStr(fields, "nombre", row.nombre()),
                pickStr(fields, "celular", row.celular()),
                pickStr(fields, "servicio", row.servicio()),
                pickStr(fields, "venta", row.venta()),
                pickStr(fields, "codigo", row.codigo()),
                pickStr(fields, "fechaServicio", row.fechaServicio()),
                pickStr(fields, "realizado", row.realizado()),
                pickStr(fields, "envioReserva", row.envioReserva()),
                pickStr(fields, "pagoAutobits", row.pagoAutobits()),
                pickStr(fields, "soporteDrive", row.soporteDrive()),
                pickStr(fields, "hojaOrigen", row.hojaOrigen())
        );
    }

    private static String pickStr(Map<String, Object> fields, String key, String fallback) {
        if (fields == null || !fields.containsKey(key) || fields.get(key) == null) {
            return fallback;
        }
        return String.valueOf(fields.get(key));
    }

    private static boolean pickBool(Map<String, Object> fields, String key, boolean fallback) {
        if (fields == null || !fields.containsKey(key) || fields.get(key) == null) {
            return fallback;
        }
        Object v = fields.get(key);
        if (v instanceof Boolean b) return b;
        String s = String.valueOf(v).trim().toLowerCase(Locale.ROOT);
        if (s.equals("true") || s.equals("si") || s.equals("sí") || s.equals("1") || s.equals("yes")) return true;
        if (s.equals("false") || s.equals("no") || s.equals("0")) return false;
        return fallback;
    }

    private static String digits(String value) {
        if (value == null) return "";
        return value.replaceAll("\\D+", "");
    }

    private static String nullToEmpty(String v) {
        return v == null ? "" : v;
    }

    private record CacheEntry(SheetsDashboardDto dto, Instant loadedAt) {
        boolean isExpired() {
            return Instant.now().isAfter(loadedAt.plus(CACHE_TTL));
        }
    }

    private static final class SyncCounters {
        int clients;
        int conversations;
        int quotes;
        int reservations;
        int sales;
        final Set<String> seenQuoteCodes = new HashSet<>();
    }
}
