package com.escuelaaves.sig.application.registro.whatsapp;

import com.escuelaaves.sig.application.ai.DiscStyleClassifier;
import com.escuelaaves.sig.application.ai.IntelligenceService;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SeguimientoWhatsappDto;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteResultDto;
import com.escuelaaves.sig.application.service.SheetsSyncService;
import com.escuelaaves.sig.application.service.SheetsWriteService;
import com.escuelaaves.sig.domain.ai.model.DiscProfile;
import com.escuelaaves.sig.domain.ai.model.SeguimientoExtraction;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.WhatsAppImportAuditEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.WhatsAppImportAuditJpaRepository;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;

@Service
@RequiredArgsConstructor
@Slf4j
public class WhatsAppRegistroService {

    private static final int MAX_MESSAGES_FOR_MODEL = 220;
    private static final int ANALYZE_CONCURRENCY = 4;

    private final IntelligenceService intelligenceService;
    private final SheetsSyncService sheetsSyncService;
    private final SheetsWriteService sheetsWriteService;
    private final WhatsAppImportAuditJpaRepository auditRepository;
    private final ObjectMapper objectMapper;

    public Map<String, Object> analyze(MultipartFile file) {
        return analyze(file == null ? List.of() : List.of(file));
    }

    public Map<String, Object> analyze(List<MultipartFile> files) {
        List<WhatsAppChatArchive.ExtractedChat> chats = WhatsAppChatArchive.collect(files);
        List<AiDraft> drafts = extractInParallel(chats);
        List<Map<String, Object>> items = new ArrayList<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        for (AiDraft draft : drafts) {
            if (draft.error() != null) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("filename", draft.filename());
                err.put("message", draft.error());
                errors.add(err);
                continue;
            }
            try {
                items.add(persistPreview(draft));
            } catch (Exception ex) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("filename", draft.filename());
                err.put("message", "No se pudo guardar el análisis de " + draft.filename() + ".");
                errors.add(err);
            }
        }
        if (items.isEmpty()) {
            throw new BadRequestException("No se pudo analizar ningún chat de WhatsApp.");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", chats.size());
        out.put("ok", items.size());
        out.put("failed", errors.size());
        out.put("items", items);
        out.put("errors", errors);
        out.put("requiereConfirmacion", true);
        if (items.size() == 1) {
            out.putAll(items.getFirst());
        }
        return out;
    }

    private List<AiDraft> extractInParallel(List<WhatsAppChatArchive.ExtractedChat> chats) {
        Semaphore slots = new Semaphore(ANALYZE_CONCURRENCY);
        List<AiDraft> drafts = new ArrayList<>();
        try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<AiDraft>> futures = new ArrayList<>();
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            for (WhatsAppChatArchive.ExtractedChat chat : chats) {
                futures.add(exec.submit(() -> {
                    slots.acquireUninterruptibly();
                    try {
                        SecurityContextHolder.getContext().setAuthentication(auth);
                        return extractWithAi(chat);
                    } catch (Exception ex) {
                        log.warn("[WhatsAppRegistro] chat {} falló: {}", chat.filename(), ex.getMessage());
                        String msg = ex instanceof BadRequestException && ex.getMessage() != null
                                ? ex.getMessage()
                                : "No se pudo analizar " + chat.filename() + ".";
                        return AiDraft.failed(chat.filename(), msg);
                    } finally {
                        SecurityContextHolder.clearContext();
                        slots.release();
                    }
                }));
            }
            for (Future<AiDraft> future : futures) {
                drafts.add(future.get());
            }
        } catch (Exception ex) {
            throw new BadRequestException("No se pudieron analizar los chats de WhatsApp.");
        }
        return drafts;
    }

    public Map<String, Object> confirmBatch(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            throw new BadRequestException("No hay chats para confirmar.");
        }
        if (items.size() > WhatsAppChatArchive.MAX_CHATS) {
            throw new BadRequestException("Máximo " + WhatsAppChatArchive.MAX_CHATS + " chats por lote.");
        }
        int ok = 0;
        List<Map<String, Object>> errors = new ArrayList<>();
        for (Map<String, Object> item : items) {
            if (item == null || item.get("previewId") == null) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("message", "previewId es obligatorio");
                errors.add(err);
                continue;
            }
            try {
                UUID previewId = UUID.fromString(String.valueOf(item.get("previewId")));
                boolean updateExisting = Boolean.TRUE.equals(item.get("updateExisting"));
                @SuppressWarnings("unchecked")
                Map<String, Object> row = item.get("row") instanceof Map<?, ?> m
                        ? (Map<String, Object>) m
                        : Map.of();
                confirm(previewId, row, updateExisting);
                ok++;
            } catch (Exception ex) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("previewId", String.valueOf(item.get("previewId")));
                err.put("message", ex.getMessage() == null ? "No se pudo guardar." : ex.getMessage());
                errors.add(err);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", ok);
        out.put("failed", errors.size());
        out.put("errors", errors);
        out.put("message", ok + " fila(s) escritas en el Excel"
                + (errors.isEmpty() ? "." : " · " + errors.size() + " con error."));
        return out;
    }

    public Map<String, Object> confirm(UUID previewId, Map<String, Object> editedRow, boolean updateExisting) {
        WhatsAppImportAuditEntity audit = auditRepository.findById(previewId)
                .orElseThrow(() -> new BadRequestException("No hay un análisis pendiente con ese id."));
        if (!"PREVIEW".equals(audit.getStatus())) {
            throw new BadRequestException("Este análisis ya fue confirmado o cancelado.");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        if (editedRow != null) {
            body.putAll(editedRow);
        }
        body.putIfAbsent("canal", "WHATSAPP");
        body.putIfAbsent("registrado", "WHATSAPP");
        SheetRowWriteResultDto result;
        if (updateExisting) {
            result = sheetsWriteService.updateSeguimiento(body);
        } else {
            result = sheetsWriteService.appendSeguimiento(body);
        }
        audit.setStatus("CONFIRMED");
        audit.setConfirmedBy(currentUsername());
        audit.setConfirmedAt(Instant.now());
        auditRepository.save(audit);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", result.success());
        out.put("message", result.message());
        out.put("previewId", previewId.toString());
        return out;
    }

    public void cancel(UUID previewId) {
        WhatsAppImportAuditEntity audit = auditRepository.findById(previewId)
                .orElseThrow(() -> new BadRequestException("No hay un análisis pendiente con ese id."));
        if ("PREVIEW".equals(audit.getStatus())) {
            audit.setStatus("CANCELLED");
            auditRepository.save(audit);
        }
    }

    private List<Map<String, Object>> findPossibleDuplicates(SeguimientoExtraction extraction) {
        List<Map<String, Object>> hits = new ArrayList<>();
        String phone = digits(extraction.valor("celular"));
        String cliente = nullToEmpty(extraction.valor("cliente")).toLowerCase(Locale.ROOT);
        var dashboard = sheetsSyncService.getDashboardSheets(false);
        if (dashboard == null || dashboard.seguimientoWhatsapp() == null) {
            return hits;
        }
        for (SeguimientoWhatsappDto row : dashboard.seguimientoWhatsapp()) {
            String rowPhone = digits(row.celular());
            boolean phoneHit = phone.length() >= 7 && rowPhone.length() >= 7
                    && (rowPhone.endsWith(phone) || phone.endsWith(rowPhone));
            boolean nameHit = cliente.length() >= 4
                    && nullToEmpty(row.cliente()).toLowerCase(Locale.ROOT).contains(cliente);
            if (!phoneHit && !nameHit) {
                continue;
            }
            Map<String, Object> hit = new LinkedHashMap<>();
            hit.put("cliente", row.cliente());
            hit.put("celular", row.celular());
            hit.put("fecha", row.fecha());
            hit.put("hojaOrigen", row.hojaOrigen());
            hit.put("fechaCotizado", row.fechaCotizado());
            hit.put("pendiente", row.pendiente());
            hit.put("disc", row.disc());
            hit.put("motivo", phoneHit && nameHit ? "celular_y_nombre" : phoneHit ? "celular" : "nombre");
            hits.add(hit);
            if (hits.size() >= 5) {
                break;
            }
        }
        return hits;
    }

    private AiDraft extractWithAi(WhatsAppChatArchive.ExtractedChat chat) {
        WhatsAppChatParser.ParsedWhatsAppChat parsed = WhatsAppChatParser.parse(chat.filename(), chat.text());
        if (parsed.messages().isEmpty()) {
            throw new BadRequestException("No se reconocieron mensajes en " + chat.filename() + ".");
        }
        List<WhatsAppChatParser.WhatsAppMessage> compact =
                WhatsAppChatParser.compactForModel(parsed.messages(), MAX_MESSAGES_FOR_MODEL);
        String rendered = WhatsAppChatParser.renderForModel(parsed, compact);
        SeguimientoExtraction extraction = intelligenceService.extractSeguimientoFromChat(rendered);
        if (parsed.inferredPhone() != null && blank(extraction.valor("celular"))) {
            extraction = copyWithPhone(extraction, parsed.inferredPhone());
        }
        DiscProfile local = DiscStyleClassifier.classify(WhatsAppChatParser.prospectTexts(parsed));
        DiscProfile merged = DiscProfile.mergePreferringModel(extraction.discAnalisis(), local);
        extraction = extraction.withDisc(merged);
        return new AiDraft(chat, parsed, extraction, null);
    }

    private static SeguimientoExtraction copyWithPhone(SeguimientoExtraction extraction, String phone) {
        extraction.campos().put(
                "celular",
                SeguimientoExtraction.FieldValue.of(phone, "INFERIDO", 0.7)
        );
        return extraction;
    }

    private Map<String, Object> persistPreview(AiDraft draft) throws Exception {
        WhatsAppChatArchive.ExtractedChat chat = draft.chat();
        WhatsAppChatParser.ParsedWhatsAppChat parsed = draft.parsed();
        SeguimientoExtraction extraction = draft.extraction();
        List<Map<String, Object>> matches = findPossibleDuplicates(extraction);
        String json = objectMapper.writeValueAsString(extraction);
        WhatsAppImportAuditEntity saved = auditRepository.save(WhatsAppImportAuditEntity.builder()
                .filename(WhatsAppChatArchive.safeName(chat.filename()))
                .fileHash(sha256(chat.text().getBytes(StandardCharsets.UTF_8)))
                .sourceKind(chat.sourceKind())
                .messageCount(parsed.messages().size())
                .model("claude")
                .extractedJson(json)
                .status("PREVIEW")
                .build());
        log.info("[WhatsAppRegistro] analizado fileHash={} mensajes={} previewId={}",
                saved.getFileHash(), parsed.messages().size(), saved.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("previewId", saved.getId().toString());
        out.put("filename", saved.getFilename());
        out.put("messageCount", parsed.messages().size());
        out.put("campos", extraction.campos());
        out.put("ultimaCotizacion", extraction.ultimaCotizacion());
        out.put("historialCotizaciones", extraction.historialCotizaciones());
        out.put("resumen", extraction.resumen());
        out.put("discAnalisis", extraction.discAnalisis());
        out.put("posibleDuplicado", matches.isEmpty() ? extraction.posibleDuplicado() : "REVISAR POSIBLE DUPLICADO");
        out.put("coincidencias", matches);
        out.put("requiereConfirmacion", true);
        return out;
    }

    private record AiDraft(
            WhatsAppChatArchive.ExtractedChat chat,
            WhatsAppChatParser.ParsedWhatsAppChat parsed,
            SeguimientoExtraction extraction,
            String error
    ) {
        static AiDraft failed(String filename, String message) {
            return new AiDraft(
                    new WhatsAppChatArchive.ExtractedChat(filename, "", "txt"),
                    null,
                    null,
                    message
            );
        }

        String filename() {
            return chat == null ? "" : chat.filename();
        }
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? "anonimo" : auth.getName();
    }

    private static String sha256(byte[] data) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        return HexFormat.of().formatHex(digest);
    }

    private static boolean blank(String v) {
        return v == null || v.isBlank();
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
