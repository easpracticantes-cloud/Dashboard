package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.dto.notification.NotificationDto;
import com.escuelaaves.sig.application.dto.ops.OpsDtos;
import com.escuelaaves.sig.application.mapper.ClientMapper;
import com.escuelaaves.sig.application.mapper.NotificationMapper;
import com.escuelaaves.sig.application.service.support.CurrentUserService;
import com.escuelaaves.sig.domain.model.*;
import com.escuelaaves.sig.domain.port.out.*;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.*;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.QuoteJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.ReservationJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.SaleJpaRepository;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * 50 operaciones de negocio para optimizar CRM, inbox, comercial, insights y auditoría del SIG.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SigOpsService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ClientRepositoryPort clientRepositoryPort;
    private final ConversationRepositoryPort conversationRepositoryPort;
    private final UserRepositoryPort userRepositoryPort;
    private final NotificationRepositoryPort notificationRepositoryPort;
    private final AuditLogRepositoryPort auditLogRepositoryPort;
    private final QuoteJpaRepository quoteJpaRepository;
    private final ReservationJpaRepository reservationJpaRepository;
    private final SaleJpaRepository saleJpaRepository;
    private final ClientMapper clientMapper;
    private final NotificationMapper notificationMapper;
    private final CurrentUserService currentUserService;

    // ——— 1–10 CRM ———

    /** 1 */ public List<ClientDto> searchClients(String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (q.isBlank()) {
            return clientRepositoryPort.findAll().stream().limit(50).map(clientMapper::toDto).toList();
        }
        return clientRepositoryPort.findAll().stream()
                .filter(c -> contains(c.getName(), q) || contains(c.getPhone(), q) || contains(c.getEmail(), q)
                        || (c.getTags() != null && c.getTags().stream().anyMatch(t -> contains(t, q))))
                .limit(100)
                .map(clientMapper::toDto)
                .toList();
    }

    /** 2 */ public List<OpsDtos.SegmentCount> countClientsBySegment() {
        Map<ClientSegment, Long> map = clientRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(ClientEntity::getSegment, Collectors.counting()));
        return Arrays.stream(ClientSegment.values())
                .map(s -> new OpsDtos.SegmentCount(s, map.getOrDefault(s, 0L)))
                .toList();
    }

    /** 3 */ @Transactional
    public ClientDto assignClient(UUID clientId, UUID userId) {
        ClientEntity client = clientOrThrow(clientId);
        UserEntity user = userOrThrow(userId);
        client.setAssignedUser(user);
        clientRepositoryPort.save(client);
        recordAudit(AuditAction.ASSIGN, "CLIENT", clientId.toString(), "Asignado a " + user.getFullName());
        return clientMapper.toDto(client);
    }

    /** 4 */ @Transactional
    public ClientDto touchLastContact(UUID clientId) {
        ClientEntity client = clientOrThrow(clientId);
        client.setLastContactAt(Instant.now());
        return clientMapper.toDto(clientRepositoryPort.save(client));
    }

    /** 5 */ @Transactional
    public ClientDto addClientTags(UUID clientId, Set<String> tags) {
        ClientEntity client = clientOrThrow(clientId);
        if (client.getTags() == null) {
            client.setTags(new HashSet<>());
        }
        if (tags != null) {
            tags.stream().filter(Objects::nonNull).map(String::trim).filter(s -> !s.isBlank())
                    .forEach(t -> client.getTags().add(t));
        }
        return clientMapper.toDto(clientRepositoryPort.save(client));
    }

    /** 6 */ @Transactional
    public ClientDto removeClientTags(UUID clientId, Set<String> tags) {
        ClientEntity client = clientOrThrow(clientId);
        if (client.getTags() != null && tags != null) {
            client.getTags().removeAll(tags);
        }
        return clientMapper.toDto(clientRepositoryPort.save(client));
    }

    /** 7 */ @Transactional
    public ClientDto findOrCreateClientByPhone(String phone, String name, ClientSegment segment) {
        if (phone == null || phone.isBlank()) {
            throw new BadRequestException("El teléfono es obligatorio");
        }
        return clientRepositoryPort.findFirstByPhone(phone.trim())
                .map(clientMapper::toDto)
                .orElseGet(() -> {
                    ClientEntity created = ClientEntity.builder()
                            .name(name != null && !name.isBlank() ? name.trim() : phone.trim())
                            .phone(phone.trim())
                            .segment(segment != null ? segment : ClientSegment.NUEVO)
                            .source("OPS_FIND_OR_CREATE")
                            .tags(new HashSet<>())
                            .lastContactAt(Instant.now())
                            .build();
                    return clientMapper.toDto(clientRepositoryPort.save(created));
                });
    }

    /** 8 */ public List<OpsDtos.ClientTimelineItem> getClientTimeline(UUID clientId) {
        clientOrThrow(clientId);
        List<OpsDtos.ClientTimelineItem> items = new ArrayList<>();
        conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getClient() != null && clientId.equals(c.getClient().getId()))
                .forEach(c -> items.add(new OpsDtos.ClientTimelineItem(
                        "CONVERSATION",
                        c.getStatus() + " · " + Optional.ofNullable(c.getLastMessagePreview()).orElse("Sin mensaje"),
                        c.getLastMessageAt() != null ? c.getLastMessageAt() : c.getCreatedAt(),
                        c.getId())));
        quoteJpaRepository.findAll().stream()
                .filter(q -> q.getClient() != null && clientId.equals(q.getClient().getId()))
                .forEach(q -> items.add(new OpsDtos.ClientTimelineItem(
                        "QUOTE", q.getCode() + " · " + q.getTitle(), q.getCreatedAt(), q.getId())));
        reservationJpaRepository.findAll().stream()
                .filter(r -> r.getClient() != null && clientId.equals(r.getClient().getId()))
                .forEach(r -> items.add(new OpsDtos.ClientTimelineItem(
                        "RESERVATION", r.getCode() + " · " + r.getExperienceName(), r.getCreatedAt(), r.getId())));
        saleJpaRepository.findAll().stream()
                .filter(s -> s.getClient() != null && clientId.equals(s.getClient().getId()))
                .forEach(s -> items.add(new OpsDtos.ClientTimelineItem(
                        "SALE", s.getCode() + " · " + s.getConcept(), s.getCreatedAt(), s.getId())));
        items.sort(Comparator.comparing(OpsDtos.ClientTimelineItem::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return items;
    }

    /** 9 */ public List<ClientDto> listClientsWithoutAssignee() {
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getAssignedUser() == null)
                .map(clientMapper::toDto)
                .toList();
    }

    /** 10 */ public byte[] exportClientsCsv() {
        StringBuilder sb = new StringBuilder("id,name,phone,email,segment,source,assignedUser\n");
        for (ClientEntity c : clientRepositoryPort.findAll()) {
            sb.append(csv(c.getId())).append(',')
                    .append(csv(c.getName())).append(',')
                    .append(csv(c.getPhone())).append(',')
                    .append(csv(c.getEmail())).append(',')
                    .append(csv(c.getSegment() != null ? c.getSegment().name() : "")).append(',')
                    .append(csv(c.getSource())).append(',')
                    .append(csv(c.getAssignedUser() != null ? c.getAssignedUser().getFullName() : ""))
                    .append('\n');
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    // ——— 11–20 Inbox ———

    /** 11 */ public long getUnreadTotal() {
        return conversationRepositoryPort.findAll().stream().mapToLong(ConversationEntity::getUnreadCount).sum();
    }

    /** 12 */ public List<OpsDtos.CountByKey> getUnreadByAdvisor() {
        Map<String, Long> map = new HashMap<>();
        for (ConversationEntity c : conversationRepositoryPort.findAll()) {
            if (c.getUnreadCount() <= 0) continue;
            String key = c.getAssignedUser() != null ? c.getAssignedUser().getFullName() : "Sin asignar";
            map.merge(key, (long) c.getUnreadCount(), Long::sum);
        }
        return map.entrySet().stream()
                .map(e -> new OpsDtos.CountByKey(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(OpsDtos.CountByKey::count).reversed())
                .toList();
    }

    /** 13 */ @Transactional
    public void markConversationRead(UUID id) {
        ConversationEntity c = conversationOrThrow(id);
        c.setUnreadCount(0);
        conversationRepositoryPort.save(c);
    }

    /** 14 */ @Transactional
    public void markConversationUnread(UUID id) {
        ConversationEntity c = conversationOrThrow(id);
        c.setUnreadCount(Math.max(1, c.getUnreadCount()));
        conversationRepositoryPort.save(c);
    }

    /** 15 */ @Transactional
    public int bulkUpdateConversationStatus(List<UUID> ids, ConversationStatus status) {
        if (ids == null || ids.isEmpty() || status == null) return 0;
        int n = 0;
        for (UUID id : ids) {
            conversationRepositoryPort.findById(id).ifPresent(c -> {
                c.setStatus(status);
                conversationRepositoryPort.save(c);
            });
            n++;
        }
        recordAudit(AuditAction.STATUS_CHANGE, "CONVERSATION", ids.size() + " items", status.name());
        return n;
    }

    /** 16 */ @Transactional
    public void transferConversation(UUID conversationId, UUID toUserId) {
        ConversationEntity c = conversationOrThrow(conversationId);
        UserEntity user = userOrThrow(toUserId);
        c.setAssignedUser(user);
        conversationRepositoryPort.save(c);
        createNotificationInternal(user, "Conversación asignada",
                "Se te asignó el seguimiento de " + c.getClient().getName(),
                NotificationType.MESSAGE, "/app/conversations/" + conversationId);
        recordAudit(AuditAction.ASSIGN, "CONVERSATION", conversationId.toString(), "Transferida a " + user.getFullName());
    }

    /** 17 */ @Transactional
    public void addConversationLabels(UUID id, Set<String> labels) {
        ConversationEntity c = conversationOrThrow(id);
        if (c.getLabels() == null) c.setLabels(new HashSet<>());
        if (labels != null) {
            labels.stream().filter(Objects::nonNull).map(String::trim).filter(s -> !s.isBlank())
                    .forEach(l -> c.getLabels().add(l));
        }
        conversationRepositoryPort.save(c);
    }

    /** 18 */ @Transactional
    public void removeConversationLabels(UUID id, Set<String> labels) {
        ConversationEntity c = conversationOrThrow(id);
        if (c.getLabels() != null && labels != null) {
            c.getLabels().removeAll(labels);
        }
        conversationRepositoryPort.save(c);
    }

    /** 19 */ public List<UUID> listStaleOpenConversations(int days) {
        Instant cutoff = Instant.now().minus(Math.max(1, days), ChronoUnit.DAYS);
        return conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getStatus() == ConversationStatus.OPEN || c.getStatus() == ConversationStatus.PENDING)
                .filter(c -> {
                    Instant at = c.getLastMessageAt() != null ? c.getLastMessageAt() : c.getCreatedAt();
                    return at != null && at.isBefore(cutoff);
                })
                .map(ConversationEntity::getId)
                .toList();
    }

    /** 20 */ @Transactional
    public void closeConversationWithNotes(UUID id, String notes) {
        ConversationEntity c = conversationOrThrow(id);
        c.setStatus(ConversationStatus.RESOLVED);
        if (notes != null && !notes.isBlank()) {
            String prev = c.getNotes() != null ? c.getNotes() + "\n" : "";
            c.setNotes(prev + notes.trim());
        }
        c.setUnreadCount(0);
        conversationRepositoryPort.save(c);
        recordAudit(AuditAction.STATUS_CHANGE, "CONVERSATION", id.toString(), "Cerrada RESOLVED");
    }

    // ——— 21–32 Comercial ———

    /** 21 */ public QuoteDto getQuote(UUID id) {
        return toQuoteDto(quoteOrThrow(id));
    }

    /** 22 */ @Transactional
    public QuoteDto changeQuoteStatus(UUID id, CommercialStatus status) {
        QuoteEntity q = quoteOrThrow(id);
        q.setStatus(status);
        QuoteEntity saved = quoteJpaRepository.save(q);
        recordAudit(AuditAction.STATUS_CHANGE, "QUOTE", id.toString(), status.name());
        return toQuoteDto(saved);
    }

    /** 23 */ public List<QuoteDto> listQuotesByClient(UUID clientId) {
        clientOrThrow(clientId);
        return quoteJpaRepository.findAll().stream()
                .filter(q -> q.getClient() != null && clientId.equals(q.getClient().getId()))
                .map(this::toQuoteDto)
                .toList();
    }

    /** 24 */ public List<QuoteDto> listExpiringQuotes(int withinDays) {
        LocalDate limit = LocalDate.now(BOGOTA).plusDays(Math.max(1, withinDays));
        return quoteJpaRepository.findAll().stream()
                .filter(q -> q.getValidUntil() != null)
                .filter(q -> !q.getValidUntil().isBefore(LocalDate.now(BOGOTA)))
                .filter(q -> !q.getValidUntil().isAfter(limit))
                .filter(q -> q.getStatus() == CommercialStatus.DRAFT || q.getStatus() == CommercialStatus.SENT)
                .map(this::toQuoteDto)
                .toList();
    }

    /** 25 */ @Transactional
    public ReservationDto convertQuoteToReservation(UUID quoteId, OpsDtos.ConvertQuoteRequest req) {
        QuoteEntity q = quoteOrThrow(quoteId);
        if (q.getStatus() == CommercialStatus.REJECTED || q.getStatus() == CommercialStatus.CANCELLED) {
            throw new BadRequestException("No se puede convertir una cotización rechazada/cancelada");
        }
        q.setStatus(CommercialStatus.ACCEPTED);
        quoteJpaRepository.save(q);
        ReservationEntity r = ReservationEntity.builder()
                .code(nextCode("RES"))
                .client(q.getClient())
                .advisor(q.getAdvisor())
                .quote(q)
                .experienceName(req != null && req.experienceName() != null ? req.experienceName() : q.getTitle())
                .partySize(req != null && req.partySize() > 0 ? req.partySize() : 1)
                .reservationDate(req != null && req.reservationDate() != null ? req.reservationDate() : LocalDate.now(BOGOTA).plusDays(7))
                .amount(req != null && req.amount() != null ? req.amount() : q.getAmount())
                .status(CommercialStatus.CONFIRMED)
                .notes("Convertida desde " + q.getCode())
                .build();
        ReservationEntity saved = reservationJpaRepository.save(r);
        recordAudit(AuditAction.CREATE, "RESERVATION", saved.getId().toString(), "Desde quote " + q.getCode());
        return toReservationDto(saved);
    }

    /** 26 */ public Map<String, Long> getCommercialPipelineSummary() {
        Map<String, Long> out = new LinkedHashMap<>();
        out.put("quotes", quoteJpaRepository.count());
        out.put("reservations", reservationJpaRepository.count());
        out.put("sales", saleJpaRepository.count());
        out.put("quotesDraft", quoteJpaRepository.findAll().stream().filter(q -> q.getStatus() == CommercialStatus.DRAFT).count());
        out.put("quotesSent", quoteJpaRepository.findAll().stream().filter(q -> q.getStatus() == CommercialStatus.SENT).count());
        out.put("quotesAccepted", quoteJpaRepository.findAll().stream().filter(q -> q.getStatus() == CommercialStatus.ACCEPTED).count());
        return out;
    }

    /** 27 */ public List<OpsDtos.AmountByKey> sumQuotesAmountByStatus() {
        Map<CommercialStatus, List<QuoteEntity>> grouped = quoteJpaRepository.findAll().stream()
                .collect(Collectors.groupingBy(QuoteEntity::getStatus));
        return Arrays.stream(CommercialStatus.values())
                .map(st -> {
                    List<QuoteEntity> list = grouped.getOrDefault(st, List.of());
                    BigDecimal sum = list.stream().map(QuoteEntity::getAmount).filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    return new OpsDtos.AmountByKey(st.name(), sum, list.size());
                })
                .filter(a -> a.count() > 0)
                .toList();
    }

    /** 28 */ public List<Map<String, Object>> listSalesByPeriod(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.now(BOGOTA).minusMonths(1);
        LocalDate t = to != null ? to : LocalDate.now(BOGOTA);
        return saleJpaRepository.findAll().stream()
                .filter(s -> s.getSaleDate() != null && !s.getSaleDate().isBefore(f) && !s.getSaleDate().isAfter(t))
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", s.getId());
                    m.put("code", s.getCode());
                    m.put("client", s.getClient().getName());
                    m.put("amount", s.getAmount());
                    m.put("saleDate", s.getSaleDate());
                    m.put("status", s.getStatus());
                    return m;
                })
                .toList();
    }

    /** 29 */ public BigDecimal sumSalesAmount(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.now(BOGOTA).minusMonths(1);
        LocalDate t = to != null ? to : LocalDate.now(BOGOTA);
        return saleJpaRepository.findAll().stream()
                .filter(s -> s.getSaleDate() != null && !s.getSaleDate().isBefore(f) && !s.getSaleDate().isAfter(t))
                .map(SaleEntity::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 30 */ @Transactional
    public void updateSalePaymentMethod(UUID id, String paymentMethod) {
        SaleEntity sale = saleJpaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Venta no encontrada: " + id));
        sale.setPaymentMethod(paymentMethod);
        saleJpaRepository.save(sale);
        recordAudit(AuditAction.UPDATE, "SALE", id.toString(), "paymentMethod=" + paymentMethod);
    }

    /** 31 */ public List<ReservationDto> listReservationsUpcoming(int days) {
        LocalDate limit = LocalDate.now(BOGOTA).plusDays(Math.max(1, days));
        return reservationJpaRepository.findAll().stream()
                .filter(r -> r.getReservationDate() != null)
                .filter(r -> !r.getReservationDate().isBefore(LocalDate.now(BOGOTA)))
                .filter(r -> !r.getReservationDate().isAfter(limit))
                .filter(r -> r.getStatus() != CommercialStatus.CANCELLED)
                .map(this::toReservationDto)
                .toList();
    }

    /** 32 */ @Transactional
    public ReservationDto cancelReservation(UUID id, String reason) {
        ReservationEntity r = reservationJpaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva no encontrada: " + id));
        r.setStatus(CommercialStatus.CANCELLED);
        if (reason != null && !reason.isBlank()) {
            String prev = r.getNotes() != null ? r.getNotes() + "\n" : "";
            r.setNotes(prev + "Cancelada: " + reason.trim());
        }
        ReservationEntity saved = reservationJpaRepository.save(r);
        recordAudit(AuditAction.STATUS_CHANGE, "RESERVATION", id.toString(), "CANCELLED");
        return toReservationDto(saved);
    }

    // ——— 33–42 Insights ———

    /** 33 */ public OpsDtos.OperationalHealth getOperationalHealth() {
        long open = conversationRepositoryPort.countByStatus(ConversationStatus.OPEN);
        long pending = conversationRepositoryPort.countByStatus(ConversationStatus.PENDING);
        long unreadNotif = notificationRepositoryPort.countByUserIdAndReadFalse(currentUserService.getCurrentUser().getId());
        long expiring = listExpiringQuotes(7).size();
        long upcoming = listReservationsUpcoming(14).size();
        OpsDtos.DataQualityReport dq = getDataQualityScore();
        return new OpsDtos.OperationalHealth(
                clientRepositoryPort.count(), open, pending, unreadNotif, expiring, upcoming, dq.score());
    }

    /** 34 */ public OpsDtos.FunnelMetrics getFunnelMetrics() {
        long clients = clientRepositoryPort.count();
        long conversations = conversationRepositoryPort.count();
        long quotes = quoteJpaRepository.count();
        long reservations = reservationJpaRepository.count();
        long sales = saleJpaRepository.count();
        double rate = quotes == 0 ? 0 : (sales * 100.0) / quotes;
        return new OpsDtos.FunnelMetrics(clients, conversations, quotes, reservations, sales,
                BigDecimal.valueOf(rate).setScale(2, RoundingMode.HALF_UP).doubleValue());
    }

    /** 35 */ public List<OpsDtos.AdvisorWorkload> getAdvisorWorkload() {
        Map<UUID, OpsDtos.AdvisorWorkload> map = new LinkedHashMap<>();
        for (UserEntity u : userRepositoryPort.findAll()) {
            if (!u.isActive()) continue;
            map.put(u.getId(), new OpsDtos.AdvisorWorkload(u.getId(), u.getFullName(), 0, 0, 0));
        }
        for (ConversationEntity c : conversationRepositoryPort.findAll()) {
            if (c.getAssignedUser() == null) continue;
            UUID id = c.getAssignedUser().getId();
            OpsDtos.AdvisorWorkload cur = map.get(id);
            if (cur == null) continue;
            long open = cur.openConversations()
                    + (c.getStatus() == ConversationStatus.OPEN || c.getStatus() == ConversationStatus.PENDING ? 1 : 0);
            long unread = cur.unreadMessages() + c.getUnreadCount();
            map.put(id, new OpsDtos.AdvisorWorkload(id, cur.fullName(), open, unread, cur.salesCount()));
        }
        for (SaleEntity s : saleJpaRepository.findAll()) {
            if (s.getAdvisor() == null) continue;
            UUID id = s.getAdvisor().getId();
            OpsDtos.AdvisorWorkload cur = map.get(id);
            if (cur == null) continue;
            map.put(id, new OpsDtos.AdvisorWorkload(id, cur.fullName(), cur.openConversations(), cur.unreadMessages(),
                    cur.salesCount() + 1));
        }
        return map.values().stream()
                .sorted(Comparator.comparingLong(OpsDtos.AdvisorWorkload::openConversations).reversed())
                .toList();
    }

    /** 36 */ public List<OpsDtos.CountByKey> getChannelBreakdown() {
        return conversationRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(c -> c.getChannel() != null ? c.getChannel().name() : "UNKNOWN", Collectors.counting()))
                .entrySet().stream()
                .map(e -> new OpsDtos.CountByKey(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(OpsDtos.CountByKey::count).reversed())
                .toList();
    }

    /** 37 */ public List<OpsDtos.CountByKey> getPriorityDistribution() {
        return conversationRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(c -> c.getPriority() != null ? c.getPriority().name() : "UNKNOWN", Collectors.counting()))
                .entrySet().stream()
                .map(e -> new OpsDtos.CountByKey(e.getKey(), e.getValue()))
                .toList();
    }

    /** 38 */ public List<OpsDtos.DailyVolume> getDailyConversationVolume(int days) {
        int d = Math.min(90, Math.max(1, days));
        LocalDate start = LocalDate.now(BOGOTA).minusDays(d - 1L);
        Map<LocalDate, Long> counts = new TreeMap<>();
        for (int i = 0; i < d; i++) {
            counts.put(start.plusDays(i), 0L);
        }
        for (ConversationEntity c : conversationRepositoryPort.findAll()) {
            Instant at = c.getLastMessageAt() != null ? c.getLastMessageAt() : c.getCreatedAt();
            if (at == null) continue;
            LocalDate day = at.atZone(BOGOTA).toLocalDate();
            if (counts.containsKey(day)) {
                counts.merge(day, 1L, Long::sum);
            }
        }
        return counts.entrySet().stream()
                .map(e -> new OpsDtos.DailyVolume(e.getKey(), e.getValue()))
                .toList();
    }

    /** 39 */ public List<OpsDtos.TopClientSales> getTopClientsBySales(int limit) {
        Map<UUID, OpsDtos.TopClientSales> acc = new HashMap<>();
        for (SaleEntity s : saleJpaRepository.findAll()) {
            if (s.getClient() == null) continue;
            UUID id = s.getClient().getId();
            OpsDtos.TopClientSales cur = acc.getOrDefault(id,
                    new OpsDtos.TopClientSales(id, s.getClient().getName(), BigDecimal.ZERO, 0));
            BigDecimal amt = s.getAmount() != null ? s.getAmount() : BigDecimal.ZERO;
            acc.put(id, new OpsDtos.TopClientSales(id, cur.clientName(), cur.total().add(amt), cur.sales() + 1));
        }
        return acc.values().stream()
                .sorted(Comparator.comparing(OpsDtos.TopClientSales::total).reversed())
                .limit(Math.max(1, limit))
                .toList();
    }

    /** 40 */ public double getConversionRateQuoteToSale() {
        long quotes = quoteJpaRepository.count();
        if (quotes == 0) return 0;
        long sales = saleJpaRepository.count();
        return BigDecimal.valueOf(sales * 100.0 / quotes).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    /** 41 */ public Map<String, Object> getAverageResponseLagHint() {
        List<ConversationEntity> list = conversationRepositoryPort.findAll();
        long withActivity = list.stream().filter(c -> c.getLastMessageAt() != null && c.getCreatedAt() != null).count();
        double avgHours = list.stream()
                .filter(c -> c.getLastMessageAt() != null && c.getCreatedAt() != null)
                .mapToLong(c -> ChronoUnit.MINUTES.between(c.getCreatedAt(), c.getLastMessageAt()))
                .filter(m -> m >= 0)
                .average()
                .orElse(0) / 60.0;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("conversationsSampled", withActivity);
        out.put("avgHoursBetweenCreateAndLastMessage",
                BigDecimal.valueOf(avgHours).setScale(2, RoundingMode.HALF_UP).doubleValue());
        out.put("note", "Proxy de actividad hasta integrar timestamps de primer reply");
        return out;
    }

    /** 42 */ public OpsDtos.DataQualityReport getDataQualityScore() {
        List<ClientEntity> clients = clientRepositoryPort.findAll();
        long total = clients.size();
        long withPhone = clients.stream().filter(c -> c.getPhone() != null && !c.getPhone().isBlank()).count();
        long quotesWithAmount = quoteJpaRepository.findAll().stream()
                .filter(q -> q.getAmount() != null && q.getAmount().compareTo(BigDecimal.ZERO) > 0).count();
        long quotesTotal = Math.max(1, quoteJpaRepository.count());
        long assignedConv = conversationRepositoryPort.findAll().stream().filter(c -> c.getAssignedUser() != null).count();
        long convTotal = Math.max(1, conversationRepositoryPort.count());
        double score = 0;
        if (total > 0) {
            score = ((withPhone * 100.0 / total)
                    + (quotesWithAmount * 100.0 / quotesTotal)
                    + (assignedConv * 100.0 / convTotal)) / 3.0;
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("phoneCoveragePct", total == 0 ? 0 : round2(withPhone * 100.0 / total));
        details.put("quoteAmountCoveragePct", round2(quotesWithAmount * 100.0 / quotesTotal));
        details.put("conversationAssigneeCoveragePct", round2(assignedConv * 100.0 / convTotal));
        return new OpsDtos.DataQualityReport(round2(score), total, withPhone, quotesWithAmount, assignedConv, details);
    }

    // ——— 43–50 Notificaciones / auditoría / usuarios ———

    /** 43 */ @Transactional
    public NotificationDto createNotification(OpsDtos.CreateNotificationRequest req) {
        UserEntity user = userOrThrow(req.userId());
        NotificationEntity n = createNotificationInternal(user, req.title(), req.body(),
                req.type() != null ? req.type() : NotificationType.INFO, req.link());
        return notificationMapper.toDto(n);
    }

    /** 44 */ @Transactional
    public int markAllNotificationsRead() {
        UserEntity user = currentUserService.getCurrentUser();
        int n = 0;
        for (NotificationEntity notif : notificationRepositoryPort.findByUserIdOrderByCreatedAtDesc(user.getId())) {
            if (!notif.isRead()) {
                notif.setRead(true);
                notificationRepositoryPort.save(notif);
                n++;
            }
        }
        return n;
    }

    /** 45 */ public long countUnreadNotifications() {
        return notificationRepositoryPort.countByUserIdAndReadFalse(currentUserService.getCurrentUser().getId());
    }

    /** 46 */ @Transactional
    public void notifyConversationAssigned(UUID conversationId) {
        ConversationEntity c = conversationOrThrow(conversationId);
        if (c.getAssignedUser() == null) {
            throw new BadRequestException("La conversación no tiene asesor asignado");
        }
        createNotificationInternal(c.getAssignedUser(), "Seguimiento asignado",
                "Cliente: " + c.getClient().getName(),
                NotificationType.MESSAGE, "/app/conversations/" + conversationId);
    }

    /** 47 */ @Transactional
    public int notifyQuoteExpiringSoon() {
        UserEntity actor = currentUserService.getCurrentUser();
        int n = 0;
        for (QuoteDto q : listExpiringQuotes(5)) {
            createNotificationInternal(actor, "Cotización por vencer",
                    q.code() + " · " + q.title() + " vence " + q.validUntil(),
                    NotificationType.WARNING, "/app/quotes");
            n++;
        }
        return n;
    }

    /** 48 */ @Transactional
    public OpsDtos.AuditEntry recordAuditEntry(AuditAction action, String entityType, String entityId, String details) {
        AuditLogEntity saved = recordAudit(action, entityType, entityId, details);
        return new OpsDtos.AuditEntry(saved.getId(), saved.getAction().name(), saved.getEntityType(),
                saved.getEntityId(), saved.getDetails(), saved.getCreatedAt());
    }

    /** 49 */ public List<OpsDtos.AuditEntry> listRecentAudit(int limit) {
        return auditLogRepositoryPort.findTop50ByOrderByCreatedAtDesc().stream()
                .limit(Math.min(50, Math.max(1, limit)))
                .map(a -> new OpsDtos.AuditEntry(a.getId(), a.getAction().name(), a.getEntityType(),
                        a.getEntityId(), a.getDetails(), a.getCreatedAt()))
                .toList();
    }

    /** 50 */ @Transactional
    public Map<String, Object> setUserActive(UUID userId, boolean active) {
        UserEntity user = userOrThrow(userId);
        user.setActive(active);
        userRepositoryPort.save(user);
        recordAudit(AuditAction.UPDATE, "USER", userId.toString(), active ? "ACTIVATED" : "DEACTIVATED");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", user.getId());
        out.put("username", user.getUsername());
        out.put("fullName", user.getFullName());
        out.put("active", user.isActive());
        return out;
    }

    // ——— helpers ———

    private NotificationEntity createNotificationInternal(UserEntity user, String title, String body,
                                                          NotificationType type, String link) {
        NotificationEntity n = NotificationEntity.builder()
                .user(user)
                .title(title)
                .body(body)
                .type(type)
                .link(link)
                .read(false)
                .build();
        return notificationRepositoryPort.save(n);
    }

    private AuditLogEntity recordAudit(AuditAction action, String entityType, String entityId, String details) {
        UserEntity user = null;
        try {
            user = currentUserService.getCurrentUser();
        } catch (Exception ignored) {
            // auditoría best-effort
        }
        return auditLogRepositoryPort.save(AuditLogEntity.builder()
                .user(user)
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .details(details)
                .build());
    }

    private ClientEntity clientOrThrow(UUID id) {
        return clientRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado: " + id));
    }

    private ConversationEntity conversationOrThrow(UUID id) {
        return conversationRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Conversación no encontrada: " + id));
    }

    private UserEntity userOrThrow(UUID id) {
        return userRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + id));
    }

    private QuoteEntity quoteOrThrow(UUID id) {
        return quoteJpaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cotización no encontrada: " + id));
    }

    private boolean contains(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q);
    }

    private String csv(Object value) {
        if (value == null) return "";
        String s = String.valueOf(value).replace("\"", "\"\"");
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s + "\"";
        }
        return s;
    }

    private String nextCode(String prefix) {
        String stamp = LocalDate.now(BOGOTA).format(DateTimeFormatter.BASIC_ISO_DATE);
        int rnd = ThreadLocalRandom.current().nextInt(1000, 9999);
        return prefix + "-" + stamp + "-" + rnd;
    }

    private double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private QuoteDto toQuoteDto(QuoteEntity e) {
        return new QuoteDto(
                e.getId(), e.getCode(),
                e.getClient().getId(), e.getClient().getName(),
                e.getAdvisor() != null ? e.getAdvisor().getId() : null,
                e.getAdvisor() != null ? e.getAdvisor().getFullName() : null,
                e.getTitle(), e.getDescription(), e.getAmount(), e.getCurrency(),
                e.getStatus(), e.getValidUntil(), e.getIssuedAt(), e.getCreatedAt()
        );
    }

    private ReservationDto toReservationDto(ReservationEntity e) {
        return new ReservationDto(
                e.getId(), e.getCode(),
                e.getClient().getId(), e.getClient().getName(),
                e.getAdvisor() != null ? e.getAdvisor().getId() : null,
                e.getAdvisor() != null ? e.getAdvisor().getFullName() : null,
                e.getQuote() != null ? e.getQuote().getId() : null,
                e.getExperienceName(), e.getPartySize(), e.getReservationDate(),
                e.getAmount(), e.getStatus(), e.getNotes(), e.getCreatedAt()
        );
    }
}
