package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.dashboard.AnalyticsDto;
import com.escuelaaves.sig.application.dto.dashboard.AnalyticsFilter;
import com.escuelaaves.sig.application.dto.dashboard.ChartSeriesDto;
import com.escuelaaves.sig.application.dto.dashboard.DashboardOverviewDto;
import com.escuelaaves.sig.application.dto.dashboard.KpiDto;
import com.escuelaaves.sig.application.mapper.ConversationMapper;
import com.escuelaaves.sig.domain.model.ClientSegment;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import com.escuelaaves.sig.domain.model.MessageDirection;
import com.escuelaaves.sig.domain.port.in.DashboardUseCase;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DashboardService implements DashboardUseCase {

    private static final ZoneId ZONE = ZoneId.of("America/Bogota");

    private final ConversationRepositoryPort conversationRepositoryPort;
    private final ClientRepositoryPort clientRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;
    private final ConversationMapper conversationMapper;
    private final CommercialService commercialService;

    @Override
    public DashboardOverviewDto getOverview() {
        return getOverview(AnalyticsFilter.empty());
    }

    @Override
    public AnalyticsDto getAnalytics() {
        return getAnalytics(AnalyticsFilter.empty());
    }

    public DashboardOverviewDto getOverview(AnalyticsFilter filter) {
        boolean noFilter = filter == null || filter.isEmpty();
        List<ConversationEntity> filtered = applyFilter(conversationRepositoryPort.findAll(), filter);
        LocalDate today = LocalDate.now(ZONE);

        long total = noFilter ? conversationRepositoryPort.count() : filtered.size();
        long todayCount = filtered.stream().filter(c -> sameDay(resolveInstant(c), today)).count();
        long pending = filtered.stream()
                .filter(c -> c.getStatus() == ConversationStatus.PENDING || c.getStatus() == ConversationStatus.OPEN)
                .count();
        long responded = filtered.stream().filter(c -> c.getStatus() == ConversationStatus.RESOLVED).count();
        long highPriority = filtered.stream().filter(this::isHighPriority).count();
        long active = filtered.stream()
                .filter(c -> c.getStatus() == ConversationStatus.OPEN || c.getStatus() == ConversationStatus.PENDING)
                .count();

        var clients = clientRepositoryPort.findAll();
        long newClients = clients.stream().filter(c -> c.getSegment() == ClientSegment.NUEVO).count();

        long inbound = messageRepositoryPort.countByDirection(MessageDirection.INBOUND);
        long outbound = messageRepositoryPort.countByDirection(MessageDirection.OUTBOUND);
        long avgResponseSeconds = outbound == 0 ? 0 : Math.max(60, Math.min(900, (inbound * 45L) / Math.max(1, outbound)));
        if (total == 0) {
            avgResponseSeconds = 0;
        }

        List<KpiDto> kpis = List.of(
                new KpiDto("TOTAL_CONVERSATIONS", "Conversaciones totales", total, 0.0),
                new KpiDto("CONVERSATIONS_TODAY", "Conversaciones del dia", todayCount, 0.0),
                new KpiDto("PENDING_MESSAGES", "Pendientes", pending, 0.0),
                new KpiDto("RESPONDED_MESSAGES", "Respondidas", responded, 0.0),
                new KpiDto("NEW_CLIENTS", "Clientes nuevos", newClients, 0.0),
                new KpiDto("QUOTES", "Cotizaciones", commercialService.countQuotes(), 0.0),
                new KpiDto("RESERVATIONS", "Reservas", commercialService.countReservations(), 0.0),
                new KpiDto("SALES", "Ventas", commercialService.countSales(), 0.0),
                new KpiDto("HIGH_PRIORITY", "Conversaciones importantes", highPriority, 0.0),
                new KpiDto("AVG_RESPONSE_SECONDS", "Tiempo promedio de respuesta (seg)", avgResponseSeconds, 0.0),
                new KpiDto("ACTIVE_CONVERSATIONS", "Conversaciones activas", active, 0.0)
        );

        var recent = filtered.stream()
                .sorted(Comparator.comparing(this::resolveInstant, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(conversationMapper::toDto)
                .toList();

        return new DashboardOverviewDto(kpis, recent);
    }

    public AnalyticsDto getAnalytics(AnalyticsFilter filter) {
        List<ConversationEntity> filtered = applyFilter(conversationRepositoryPort.findAll(), filter);

        List<String> statusLabels = List.of("Abiertas", "Pendientes", "Resueltas", "Archivadas");
        List<Long> statusValues = Arrays.stream(ConversationStatus.values())
                .map(status -> filtered.stream().filter(c -> c.getStatus() == status).count())
                .toList();

        Map<String, Long> byDay = buildLast7Days(filtered);
        Map<String, Long> byHour = buildByHour(filtered);
        Map<String, Long> byCategory = buildByCategory(filtered);
        Map<String, Long> byImportance = buildByImportance(filtered);

        long newClients = clientRepositoryPort.findAll().stream()
                .filter(c -> c.getSegment() == ClientSegment.NUEVO)
                .count();
        long recurringClients = clientRepositoryPort.findAll().stream()
                .filter(c -> c.getSegment() == ClientSegment.FRECUENTE || c.getSegment() == ClientSegment.VIP)
                .count();

        long inbound = messageRepositoryPort.countByDirection(MessageDirection.INBOUND);
        long outbound = messageRepositoryPort.countByDirection(MessageDirection.OUTBOUND);

        Map<String, Long> byAdvisor = filtered.stream()
                .collect(Collectors.groupingBy(
                        c -> c.getAssignedUser() != null && c.getAssignedUser().getFullName() != null
                                ? c.getAssignedUser().getFullName()
                                : "Sin asignar",
                        LinkedHashMap::new,
                        Collectors.counting()));
        if (byAdvisor.isEmpty()) {
            byAdvisor.put("Sin asignar", 0L);
        }

        List<ChartSeriesDto> series = List.of(
                new ChartSeriesDto("Conversaciones por dia", new ArrayList<>(byDay.keySet()), new ArrayList<>(byDay.values())),
                new ChartSeriesDto("Conversaciones por hora", new ArrayList<>(byHour.keySet()), new ArrayList<>(byHour.values())),
                new ChartSeriesDto("Por estado", statusLabels, statusValues),
                new ChartSeriesDto("Por importancia", new ArrayList<>(byImportance.keySet()), new ArrayList<>(byImportance.values())),
                new ChartSeriesDto("Por categoria", new ArrayList<>(byCategory.keySet()), new ArrayList<>(byCategory.values())),
                new ChartSeriesDto("Clientes nuevos vs recurrentes", List.of("Nuevos", "Recurrentes"), List.of(newClients, recurringClients)),
                new ChartSeriesDto("Mensajes por direccion", List.of("Recibidos", "Enviados"), List.of(inbound, outbound)),
                new ChartSeriesDto("Ranking de asesores", new ArrayList<>(byAdvisor.keySet()), new ArrayList<>(byAdvisor.values()))
        );

        long pending = filtered.stream()
                .filter(c -> c.getStatus() == ConversationStatus.PENDING || c.getStatus() == ConversationStatus.OPEN)
                .count();
        long high = filtered.stream().filter(this::isHighPriority).count();

        List<KpiDto> summary = List.of(
                new KpiDto("TOTAL_CONVERSATIONS", "Conversaciones filtradas", filtered.size(), null),
                new KpiDto("PENDING_MESSAGES", "Pendientes", pending, null),
                new KpiDto("HIGH_PRIORITY", "Alta prioridad", high, null),
                new KpiDto("TOTAL_CLIENTS", "Clientes totales", clientRepositoryPort.count(), null),
                new KpiDto("TOTAL_MESSAGES", "Mensajes totales", messageRepositoryPort.count(), null)
        );

        return new AnalyticsDto(series, summary);
    }

    private List<ConversationEntity> applyFilter(List<ConversationEntity> source, AnalyticsFilter filter) {
        if (filter == null || filter.isEmpty()) {
            return source;
        }
        return source.stream().filter(c -> matches(c, filter)).toList();
    }

    private boolean matches(ConversationEntity c, AnalyticsFilter filter) {
        Instant instant = resolveInstant(c);
        LocalDate date = instant == null ? null : LocalDate.ofInstant(instant, ZONE);

        if (filter.year() != null && (date == null || date.getYear() != filter.year())) {
            return false;
        }
        if (filter.month() != null && (date == null || date.getMonthValue() != filter.month())) {
            return false;
        }
        if (filter.from() != null && (date == null || date.isBefore(filter.from()))) {
            return false;
        }
        if (filter.to() != null && (date == null || date.isAfter(filter.to()))) {
            return false;
        }
        if (filter.status() != null && !filter.status().isBlank()) {
            ConversationStatus expected = parseStatus(filter.status());
            if (expected != null && c.getStatus() != expected) {
                return false;
            }
        }
        if (filter.importance() != null && !filter.importance().isBlank()) {
            if (!matchesImportance(c, filter.importance())) {
                return false;
            }
        }
        if (filter.category() != null && !filter.category().isBlank()) {
            String cat = filter.category().trim().toLowerCase(Locale.ROOT);
            boolean inLabels = c.getLabels() != null && c.getLabels().stream()
                    .anyMatch(l -> l != null && l.toLowerCase(Locale.ROOT).contains(cat));
            boolean inCategory = c.getCategory() != null && c.getCategory().toLowerCase(Locale.ROOT).contains(cat);
            if (!inLabels && !inCategory) {
                return false;
            }
        }
        if (filter.name() != null && !filter.name().isBlank()) {
            String name = filter.name().trim().toLowerCase(Locale.ROOT);
            String clientName = c.getClient() != null && c.getClient().getName() != null
                    ? c.getClient().getName().toLowerCase(Locale.ROOT) : "";
            if (!clientName.contains(name)) {
                return false;
            }
        }
        if (filter.phone() != null && !filter.phone().isBlank()) {
            String phone = filter.phone().trim();
            String clientPhone = c.getClient() != null && c.getClient().getPhone() != null
                    ? c.getClient().getPhone() : "";
            if (!clientPhone.contains(phone)) {
                return false;
            }
        }
        return true;
    }

    private boolean matchesImportance(ConversationEntity c, String raw) {
        String v = raw.trim().toUpperCase(Locale.ROOT);
        if (v.contains("ALT") || v.equals("HIGH") || v.equals("URGENT")) {
            return isHighPriority(c);
        }
        if (v.contains("BAJ") || v.equals("LOW")) {
            return c.getPriority() == ConversationPriority.LOW || c.getImportance() <= 2;
        }
        if (v.contains("MED") || v.equals("MEDIUM")) {
            return c.getPriority() == ConversationPriority.MEDIUM || c.getImportance() == 3;
        }
        try {
            return c.getPriority() == ConversationPriority.valueOf(v);
        } catch (Exception ignored) {
            return true;
        }
    }

    private ConversationStatus parseStatus(String raw) {
        String v = raw.trim().toUpperCase(Locale.ROOT);
        if (v.contains("PEND")) return ConversationStatus.PENDING;
        if (v.contains("RESUEL") || v.contains("RESOLV")) return ConversationStatus.RESOLVED;
        if (v.contains("ARCH")) return ConversationStatus.ARCHIVED;
        if (v.contains("ABIERT") || v.equals("OPEN")) return ConversationStatus.OPEN;
        try {
            return ConversationStatus.valueOf(v);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean isHighPriority(ConversationEntity c) {
        return c.getPriority() == ConversationPriority.HIGH
                || c.getPriority() == ConversationPriority.URGENT
                || c.getImportance() >= 4;
    }

    private Instant resolveInstant(ConversationEntity c) {
        return c.getLastMessageAt() != null ? c.getLastMessageAt() : c.getCreatedAt();
    }

    private boolean sameDay(Instant instant, LocalDate day) {
        return instant != null && LocalDate.ofInstant(instant, ZONE).equals(day);
    }

    private Map<String, Long> buildLast7Days(List<ConversationEntity> filtered) {
        Map<String, Long> map = new LinkedHashMap<>();
        LocalDate today = LocalDate.now(ZONE);
        String[] labels = {"Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"};
        for (int i = 6; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            String label = labels[d.getDayOfWeek().getValue() - 1];
            long count = filtered.stream().filter(c -> sameDay(resolveInstant(c), d)).count();
            String key = label;
            if (map.containsKey(key)) {
                key = label + " " + d.getDayOfMonth();
            }
            map.put(key, count);
        }
        return map;
    }

    private Map<String, Long> buildByHour(List<ConversationEntity> filtered) {
        Map<String, Long> map = new LinkedHashMap<>();
        for (int h = 8; h <= 18; h++) {
            final int hour = h;
            long count = filtered.stream()
                    .map(this::resolveInstant)
                    .filter(Objects::nonNull)
                    .filter(i -> LocalDate.ofInstant(i, ZONE).equals(LocalDate.now(ZONE))
                            || ChronoUnit.DAYS.between(LocalDate.ofInstant(i, ZONE), LocalDate.now(ZONE)) <= 30)
                    .filter(i -> i.atZone(ZONE).getHour() == hour)
                    .count();
            map.put(String.valueOf(h), count);
        }
        return map;
    }

    private Map<String, Long> buildByCategory(List<ConversationEntity> filtered) {
        Map<String, Long> map = new LinkedHashMap<>();
        for (ConversationEntity c : filtered) {
            String key = c.getCategory();
            if (key == null || key.isBlank()) {
                if (c.getLabels() != null && !c.getLabels().isEmpty()) {
                    key = c.getLabels().iterator().next();
                } else {
                    key = "Sin categoria";
                }
            }
            map.merge(key, 1L, Long::sum);
        }
        if (map.isEmpty()) {
            map.put("Sin categoria", 0L);
        }
        return map;
    }

    private Map<String, Long> buildByImportance(List<ConversationEntity> filtered) {
        Map<String, Long> map = new LinkedHashMap<>();
        map.put("Baja", filtered.stream().filter(c -> c.getPriority() == ConversationPriority.LOW).count());
        map.put("Media", filtered.stream().filter(c -> c.getPriority() == ConversationPriority.MEDIUM).count());
        map.put("Alta", filtered.stream().filter(c -> c.getPriority() == ConversationPriority.HIGH).count());
        map.put("Urgente", filtered.stream().filter(c -> c.getPriority() == ConversationPriority.URGENT).count());
        return map;
    }
}
