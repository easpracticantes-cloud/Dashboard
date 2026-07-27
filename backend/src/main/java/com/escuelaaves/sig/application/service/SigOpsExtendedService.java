package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.dto.commercial.SaleDto;
import com.escuelaaves.sig.application.dto.conversation.ConversationDto;
import com.escuelaaves.sig.application.dto.conversation.MessageDto;
import com.escuelaaves.sig.application.dto.ops.OpsDtos;
import com.escuelaaves.sig.application.dto.ops.OpsExtendedDtos;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.application.mapper.ClientMapper;
import com.escuelaaves.sig.application.mapper.ConversationMapper;
import com.escuelaaves.sig.application.mapper.UserMapper;
import com.escuelaaves.sig.application.service.support.CurrentUserService;
import com.escuelaaves.sig.domain.model.*;
import com.escuelaaves.sig.domain.port.out.*;
import com.escuelaaves.sig.domain.port.out.integration.IntegrationPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.*;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.MessageJpaRepository;
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
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * Ola 51–120: 70 funciones adicionales alineadas a CRM, inbox, comercial, calidad y operación diaria.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SigOpsExtendedService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ClientRepositoryPort clientRepositoryPort;
    private final ConversationRepositoryPort conversationRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;
    private final MessageJpaRepository messageJpaRepository;
    private final UserRepositoryPort userRepositoryPort;
    private final AuditLogRepositoryPort auditLogRepositoryPort;
    private final SystemSettingRepositoryPort systemSettingRepositoryPort;
    private final QuoteJpaRepository quoteJpaRepository;
    private final ReservationJpaRepository reservationJpaRepository;
    private final SaleJpaRepository saleJpaRepository;
    private final List<IntegrationPort> integrationPorts;
    private final ClientMapper clientMapper;
    private final ConversationMapper conversationMapper;
    private final UserMapper userMapper;
    private final CurrentUserService currentUserService;
    private final SigOpsService sigOpsService;

    // ——— 51–62 CRM avanzado ———

    /** 51 */ public List<ClientDto> listClientsBySource(String source) {
        String s = source == null ? "" : source.trim().toLowerCase(Locale.ROOT);
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getSource() != null && c.getSource().toLowerCase(Locale.ROOT).contains(s))
                .map(clientMapper::toDto)
                .toList();
    }

    /** 52 */ @Transactional
    public ClientDto updateClientSegment(UUID clientId, ClientSegment segment) {
        if (segment == null) throw new BadRequestException("Segmento requerido");
        ClientEntity c = clientOrThrow(clientId);
        c.setSegment(segment);
        ClientEntity saved = clientRepositoryPort.save(c);
        audit(AuditAction.UPDATE, "CLIENT", clientId.toString(), "segment=" + segment);
        return clientMapper.toDto(saved);
    }

    /** 53 */ public List<ClientDto> listVipClients() {
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getSegment() == ClientSegment.VIP)
                .map(clientMapper::toDto)
                .toList();
    }

    /** 54 */ public List<ClientDto> listInactiveClients() {
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getSegment() == ClientSegment.INACTIVO)
                .map(clientMapper::toDto)
                .toList();
    }

    /** 55 */ @Transactional
    public int reassignClientsBulk(List<UUID> clientIds, UUID userId) {
        UserEntity user = userOrThrow(userId);
        int n = 0;
        if (clientIds == null) return 0;
        for (UUID id : clientIds) {
            Optional<ClientEntity> opt = clientRepositoryPort.findById(id);
            if (opt.isEmpty()) continue;
            ClientEntity c = opt.get();
            c.setAssignedUser(user);
            clientRepositoryPort.save(c);
            n++;
        }
        audit(AuditAction.ASSIGN, "CLIENT", n + " clients", "bulk -> " + user.getFullName());
        return n;
    }

    /** 56 */ public List<OpsExtendedDtos.SourceCount> countClientsBySource() {
        return clientRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(
                        c -> c.getSource() == null || c.getSource().isBlank() ? "SIN_FUENTE" : c.getSource(),
                        Collectors.counting()))
                .entrySet().stream()
                .map(e -> new OpsExtendedDtos.SourceCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(OpsExtendedDtos.SourceCount::count).reversed())
                .toList();
    }

    /** 57 */ @Transactional
    public ClientDto mergeClientNotes(UUID clientId, String notes) {
        ClientEntity c = clientOrThrow(clientId);
        if (notes != null && !notes.isBlank()) {
            String prev = c.getNotes() != null ? c.getNotes() + "\n" : "";
            c.setNotes(prev + notes.trim());
        }
        return clientMapper.toDto(clientRepositoryPort.save(c));
    }

    /** 58 */ public List<ClientDto> listClientsContactedSince(int days) {
        Instant cutoff = Instant.now().minus(Math.max(1, days), ChronoUnit.DAYS);
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getLastContactAt() != null && !c.getLastContactAt().isBefore(cutoff))
                .map(clientMapper::toDto)
                .toList();
    }

    /** 59 */ public List<ClientDto> listClientsNeverContacted() {
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getLastContactAt() == null)
                .map(clientMapper::toDto)
                .toList();
    }

    /** 60 */ public ClientSegment suggestSegmentForClient(UUID clientId) {
        clientOrThrow(clientId);
        long sales = saleJpaRepository.findAll().stream()
                .filter(s -> s.getClient() != null && clientId.equals(s.getClient().getId())).count();
        long conv = conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getClient() != null && clientId.equals(c.getClient().getId())).count();
        if (sales >= 3 || (sales >= 1 && conv >= 5)) return ClientSegment.VIP;
        if (sales >= 1 || conv >= 3) return ClientSegment.FRECUENTE;
        Instant cutoff = Instant.now().minus(90, ChronoUnit.DAYS);
        boolean recent = conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getClient() != null && clientId.equals(c.getClient().getId()))
                .anyMatch(c -> {
                    Instant at = c.getLastMessageAt() != null ? c.getLastMessageAt() : c.getCreatedAt();
                    return at != null && !at.isBefore(cutoff);
                });
        return recent ? ClientSegment.NUEVO : ClientSegment.INACTIVO;
    }

    /** 61 */ public byte[] exportClientsBySegmentCsv(ClientSegment segment) {
        StringBuilder sb = new StringBuilder("id,name,phone,email,segment,source\n");
        clientRepositoryPort.findAll().stream()
                .filter(c -> segment == null || c.getSegment() == segment)
                .forEach(c -> sb.append(csv(c.getId())).append(',')
                        .append(csv(c.getName())).append(',')
                        .append(csv(c.getPhone())).append(',')
                        .append(csv(c.getEmail())).append(',')
                        .append(csv(c.getSegment())).append(',')
                        .append(csv(c.getSource())).append('\n'));
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** 62 */ public List<OpsExtendedDtos.DuplicatePhone> duplicatePhoneCheck() {
        Map<String, List<ClientEntity>> byPhone = clientRepositoryPort.findAll().stream()
                .filter(c -> c.getPhone() != null && !c.getPhone().isBlank())
                .collect(Collectors.groupingBy(c -> c.getPhone().trim()));
        return byPhone.entrySet().stream()
                .filter(e -> e.getValue().size() > 1)
                .map(e -> new OpsExtendedDtos.DuplicatePhone(
                        e.getKey(),
                        e.getValue().size(),
                        e.getValue().stream().map(ClientEntity::getId).toList()))
                .toList();
    }

    // ——— 63–80 Inbox / mensajes ———

    /** 63 */ public List<ConversationDto> listMyInbox() {
        UUID me = currentUserService.getCurrentUser().getId();
        return conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getAssignedUser() != null && me.equals(c.getAssignedUser().getId()))
                .filter(c -> c.getStatus() == ConversationStatus.OPEN || c.getStatus() == ConversationStatus.PENDING)
                .sorted(Comparator.comparing(
                        (ConversationEntity c) -> c.getLastMessageAt() != null ? c.getLastMessageAt() : c.getCreatedAt(),
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(conversationMapper::toDto)
                .toList();
    }

    /** 64 */ public List<ConversationDto> listUnassignedConversations() {
        return conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getAssignedUser() == null)
                .filter(c -> c.getStatus() != ConversationStatus.ARCHIVED)
                .map(conversationMapper::toDto)
                .toList();
    }

    /** 65 */ @Transactional
    public ConversationDto setConversationPriority(UUID id, ConversationPriority priority) {
        if (priority == null) throw new BadRequestException("Prioridad requerida");
        ConversationEntity c = conversationOrThrow(id);
        c.setPriority(priority);
        return conversationMapper.toDto(conversationRepositoryPort.save(c));
    }

    /** 66 */ @Transactional
    public ConversationDto setConversationImportance(UUID id, int importance) {
        ConversationEntity c = conversationOrThrow(id);
        c.setImportance(Math.max(1, Math.min(5, importance)));
        return conversationMapper.toDto(conversationRepositoryPort.save(c));
    }

    /** 67 */ @Transactional
    public ConversationDto setConversationCategory(UUID id, String category) {
        ConversationEntity c = conversationOrThrow(id);
        c.setCategory(category);
        return conversationMapper.toDto(conversationRepositoryPort.save(c));
    }

    /** 68 */ @Transactional
    public ConversationDto archiveConversation(UUID id) {
        ConversationEntity c = conversationOrThrow(id);
        c.setStatus(ConversationStatus.ARCHIVED);
        c.setUnreadCount(0);
        audit(AuditAction.STATUS_CHANGE, "CONVERSATION", id.toString(), "ARCHIVED");
        return conversationMapper.toDto(conversationRepositoryPort.save(c));
    }

    /** 69 */ @Transactional
    public ConversationDto reopenConversation(UUID id) {
        ConversationEntity c = conversationOrThrow(id);
        c.setStatus(ConversationStatus.OPEN);
        audit(AuditAction.STATUS_CHANGE, "CONVERSATION", id.toString(), "REOPENED");
        return conversationMapper.toDto(conversationRepositoryPort.save(c));
    }

    /** 70 */ public List<OpsDtos.CountByKey> countConversationsByStatus() {
        return Arrays.stream(ConversationStatus.values())
                .map(st -> new OpsDtos.CountByKey(st.name(), conversationRepositoryPort.countByStatus(st)))
                .toList();
    }

    /** 71 */ public List<OpsDtos.CountByKey> countConversationsByPriority() {
        return conversationRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(c -> c.getPriority() != null ? c.getPriority().name() : "UNKNOWN", Collectors.counting()))
                .entrySet().stream()
                .map(e -> new OpsDtos.CountByKey(e.getKey(), e.getValue()))
                .toList();
    }

    /** 72 */ public List<ConversationDto> listHighPriorityOpen() {
        return conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getStatus() == ConversationStatus.OPEN || c.getStatus() == ConversationStatus.PENDING)
                .filter(c -> c.getPriority() == ConversationPriority.HIGH || c.getPriority() == ConversationPriority.URGENT)
                .map(conversationMapper::toDto)
                .toList();
    }

    /** 73 */ public List<ConversationDto> searchConversations(String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (q.isBlank()) return List.of();
        return conversationRepositoryPort.findAll().stream()
                .filter(c ->
                        contains(c.getLastMessagePreview(), q)
                                || contains(c.getCategory(), q)
                                || contains(c.getNotes(), q)
                                || (c.getClient() != null && (contains(c.getClient().getName(), q) || contains(c.getClient().getPhone(), q)))
                                || (c.getLabels() != null && c.getLabels().stream().anyMatch(l -> contains(l, q))))
                .limit(100)
                .map(conversationMapper::toDto)
                .toList();
    }

    /** 74 */ public long getConversationMessageCount(UUID conversationId) {
        conversationOrThrow(conversationId);
        return messageRepositoryPort.findByConversationIdOrderBySentAtAsc(conversationId).size();
    }

    /** 75 */ public List<MessageDto> listRecentMessages(int limit) {
        int lim = Math.min(200, Math.max(1, limit));
        return messageJpaRepository.findAll().stream()
                .sorted(Comparator.comparing(MessageEntity::getSentAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(lim)
                .map(conversationMapper::toDto)
                .toList();
    }

    /** 76 */ @Transactional
    public MessageDto updateMessageStatus(UUID messageId, MessageStatus status) {
        if (status == null) throw new BadRequestException("Estado de mensaje requerido");
        MessageEntity m = messageJpaRepository.findById(messageId)
                .orElseThrow(() -> new ResourceNotFoundException("Mensaje no encontrado: " + messageId));
        m.setStatus(status);
        return conversationMapper.toDto(messageJpaRepository.save(m));
    }

    /** 77 */ public OpsExtendedDtos.MessageStats countInboundOutbound() {
        long in = messageRepositoryPort.countByDirection(MessageDirection.INBOUND);
        long out = messageRepositoryPort.countByDirection(MessageDirection.OUTBOUND);
        return new OpsExtendedDtos.MessageStats(in, out, in + out);
    }

    /** 78 */ public List<ConversationDto> listConversationsWithoutMessages() {
        return conversationRepositoryPort.findAll().stream()
                .filter(c -> messageRepositoryPort.findByConversationIdOrderBySentAtAsc(c.getId()).isEmpty())
                .map(conversationMapper::toDto)
                .toList();
    }

    /** 79 */ @Transactional
    public ConversationDto pinNoteOnConversation(UUID id, String notes) {
        ConversationEntity c = conversationOrThrow(id);
        if (notes != null && !notes.isBlank()) {
            String prev = c.getNotes() != null ? c.getNotes() + "\n" : "";
            c.setNotes(prev + "[" + Instant.now() + "] " + notes.trim());
        }
        return conversationMapper.toDto(conversationRepositoryPort.save(c));
    }

    /** 80 */ @Transactional
    public int bulkAssignConversations(List<UUID> conversationIds, UUID userId) {
        UserEntity user = userOrThrow(userId);
        int n = 0;
        if (conversationIds == null) return 0;
        for (UUID id : conversationIds) {
            Optional<ConversationEntity> opt = conversationRepositoryPort.findById(id);
            if (opt.isEmpty()) continue;
            ConversationEntity c = opt.get();
            c.setAssignedUser(user);
            conversationRepositoryPort.save(c);
            n++;
        }
        audit(AuditAction.ASSIGN, "CONVERSATION", n + " items", "bulk -> " + user.getFullName());
        return n;
    }

    // ——— 81–100 Comercial ———

    /** 81 */ public ReservationDto getReservation(UUID id) {
        return toReservationDto(reservationOrThrow(id));
    }

    /** 82 */ public SaleDto getSale(UUID id) {
        return toSaleDto(saleOrThrow(id));
    }

    /** 83 */ @Transactional
    public ReservationDto changeReservationStatus(UUID id, CommercialStatus status) {
        if (status == null) throw new BadRequestException("Estado requerido");
        ReservationEntity r = reservationOrThrow(id);
        r.setStatus(status);
        audit(AuditAction.STATUS_CHANGE, "RESERVATION", id.toString(), status.name());
        return toReservationDto(reservationJpaRepository.save(r));
    }

    /** 84 */ @Transactional
    public SaleDto changeSaleStatus(UUID id, CommercialStatus status) {
        if (status == null) throw new BadRequestException("Estado requerido");
        SaleEntity s = saleOrThrow(id);
        s.setStatus(status);
        audit(AuditAction.STATUS_CHANGE, "SALE", id.toString(), status.name());
        return toSaleDto(saleJpaRepository.save(s));
    }

    /** 85 */ @Transactional
    public SaleDto convertReservationToSale(UUID reservationId, OpsExtendedDtos.ConvertReservationToSaleRequest req) {
        ReservationEntity r = reservationOrThrow(reservationId);
        if (r.getStatus() == CommercialStatus.CANCELLED) {
            throw new BadRequestException("No se puede convertir una reserva cancelada");
        }
        r.setStatus(CommercialStatus.COMPLETED);
        reservationJpaRepository.save(r);
        SaleEntity sale = SaleEntity.builder()
                .code(nextCode("VTA"))
                .client(r.getClient())
                .advisor(r.getAdvisor())
                .reservation(r)
                .concept(req != null && req.concept() != null ? req.concept() : r.getExperienceName())
                .amount(req != null && req.amount() != null ? req.amount() : r.getAmount())
                .currency("COP")
                .saleDate(LocalDate.now(BOGOTA))
                .status(CommercialStatus.COMPLETED)
                .paymentMethod(req != null ? req.paymentMethod() : null)
                .build();
        SaleEntity saved = saleJpaRepository.save(sale);
        audit(AuditAction.CREATE, "SALE", saved.getId().toString(), "from reservation " + r.getCode());
        return toSaleDto(saved);
    }

    /** 86 */ public List<QuoteDto> listQuotesByAdvisor(UUID advisorId) {
        return quoteJpaRepository.findAll().stream()
                .filter(q -> q.getAdvisor() != null && advisorId.equals(q.getAdvisor().getId()))
                .map(this::toQuoteDto)
                .toList();
    }

    /** 87 */ public List<SaleDto> listSalesByAdvisor(UUID advisorId) {
        return saleJpaRepository.findAll().stream()
                .filter(s -> s.getAdvisor() != null && advisorId.equals(s.getAdvisor().getId()))
                .map(this::toSaleDto)
                .toList();
    }

    /** 88 */ public List<ReservationDto> listReservationsByClient(UUID clientId) {
        clientOrThrow(clientId);
        return reservationJpaRepository.findAll().stream()
                .filter(r -> r.getClient() != null && clientId.equals(r.getClient().getId()))
                .map(this::toReservationDto)
                .toList();
    }

    /** 89 */ public List<SaleDto> listSalesByClient(UUID clientId) {
        clientOrThrow(clientId);
        return saleJpaRepository.findAll().stream()
                .filter(s -> s.getClient() != null && clientId.equals(s.getClient().getId()))
                .map(this::toSaleDto)
                .toList();
    }

    /** 90 */ public BigDecimal averageSaleAmount() {
        List<BigDecimal> amounts = saleJpaRepository.findAll().stream()
                .map(SaleEntity::getAmount).filter(Objects::nonNull).toList();
        if (amounts.isEmpty()) return BigDecimal.ZERO;
        BigDecimal sum = amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(amounts.size()), 2, RoundingMode.HALF_UP);
    }

    /** 91 */ public BigDecimal averageQuoteAmount() {
        List<BigDecimal> amounts = quoteJpaRepository.findAll().stream()
                .map(QuoteEntity::getAmount)
                .filter(a -> a != null && a.compareTo(BigDecimal.ZERO) > 0)
                .toList();
        if (amounts.isEmpty()) return BigDecimal.ZERO;
        BigDecimal sum = amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(amounts.size()), 2, RoundingMode.HALF_UP);
    }

    /** 92 */ public List<QuoteDto> listZeroAmountQuotes() {
        return quoteJpaRepository.findAll().stream()
                .filter(q -> q.getAmount() == null || q.getAmount().compareTo(BigDecimal.ZERO) == 0)
                .map(this::toQuoteDto)
                .toList();
    }

    /** 93 */ public List<ReservationDto> listConfirmedReservationsToday() {
        LocalDate today = LocalDate.now(BOGOTA);
        return reservationJpaRepository.findAll().stream()
                .filter(r -> today.equals(r.getReservationDate()))
                .filter(r -> r.getStatus() == CommercialStatus.CONFIRMED || r.getStatus() == CommercialStatus.ACCEPTED)
                .map(this::toReservationDto)
                .toList();
    }

    /** 94 */ public List<OpsExtendedDtos.MonthlyPoint> monthlySalesSeries(int months) {
        int m = Math.min(24, Math.max(1, months));
        YearMonth start = YearMonth.now(BOGOTA).minusMonths(m - 1L);
        Map<YearMonth, List<SaleEntity>> grouped = saleJpaRepository.findAll().stream()
                .filter(s -> s.getSaleDate() != null)
                .filter(s -> !YearMonth.from(s.getSaleDate()).isBefore(start))
                .collect(Collectors.groupingBy(s -> YearMonth.from(s.getSaleDate())));
        List<OpsExtendedDtos.MonthlyPoint> out = new ArrayList<>();
        for (int i = 0; i < m; i++) {
            YearMonth ym = start.plusMonths(i);
            List<SaleEntity> list = grouped.getOrDefault(ym, List.of());
            BigDecimal amount = list.stream().map(SaleEntity::getAmount).filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            out.add(new OpsExtendedDtos.MonthlyPoint(ym.toString(), list.size(), amount));
        }
        return out;
    }

    /** 95 */ public List<OpsExtendedDtos.MonthlyPoint> monthlyQuotesSeries(int months) {
        int m = Math.min(24, Math.max(1, months));
        YearMonth start = YearMonth.now(BOGOTA).minusMonths(m - 1L);
        Map<YearMonth, List<QuoteEntity>> grouped = quoteJpaRepository.findAll().stream()
                .filter(q -> q.getIssuedAt() != null || q.getCreatedAt() != null)
                .collect(Collectors.groupingBy(q -> {
                    LocalDate d = q.getIssuedAt() != null
                            ? q.getIssuedAt()
                            : q.getCreatedAt().atZone(BOGOTA).toLocalDate();
                    return YearMonth.from(d);
                }));
        List<OpsExtendedDtos.MonthlyPoint> out = new ArrayList<>();
        for (int i = 0; i < m; i++) {
            YearMonth ym = start.plusMonths(i);
            List<QuoteEntity> list = grouped.getOrDefault(ym, List.of());
            BigDecimal amount = list.stream().map(QuoteEntity::getAmount).filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            out.add(new OpsExtendedDtos.MonthlyPoint(ym.toString(), list.size(), amount));
        }
        return out;
    }

    /** 96 */ public List<OpsDtos.AmountByKey> revenueByPaymentMethod() {
        return saleJpaRepository.findAll().stream()
                .collect(Collectors.groupingBy(s -> s.getPaymentMethod() == null || s.getPaymentMethod().isBlank()
                        ? "SIN_METODO" : s.getPaymentMethod()))
                .entrySet().stream()
                .map(e -> {
                    BigDecimal sum = e.getValue().stream().map(SaleEntity::getAmount).filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    return new OpsDtos.AmountByKey(e.getKey(), sum, e.getValue().size());
                })
                .sorted(Comparator.comparing(OpsDtos.AmountByKey::amount).reversed())
                .toList();
    }

    /** 97 */ @Transactional
    public OpsExtendedDtos.CloneQuoteResult duplicateQuote(UUID quoteId) {
        QuoteEntity src = quoteOrThrow(quoteId);
        QuoteEntity clone = QuoteEntity.builder()
                .code(nextCode("COT"))
                .client(src.getClient())
                .advisor(src.getAdvisor())
                .title(src.getTitle() + " (copia)")
                .description(src.getDescription())
                .amount(src.getAmount())
                .currency(src.getCurrency())
                .status(CommercialStatus.DRAFT)
                .validUntil(src.getValidUntil() != null ? src.getValidUntil().plusDays(15) : LocalDate.now(BOGOTA).plusDays(15))
                .issuedAt(LocalDate.now(BOGOTA))
                .build();
        QuoteEntity saved = quoteJpaRepository.save(clone);
        audit(AuditAction.CREATE, "QUOTE", saved.getId().toString(), "cloned from " + src.getCode());
        return new OpsExtendedDtos.CloneQuoteResult(src.getId(), saved.getId(), saved.getCode());
    }

    /** 98 */ @Transactional
    public QuoteDto extendQuoteValidity(UUID quoteId, LocalDate validUntil) {
        if (validUntil == null) throw new BadRequestException("validUntil requerido");
        QuoteEntity q = quoteOrThrow(quoteId);
        q.setValidUntil(validUntil);
        return toQuoteDto(quoteJpaRepository.save(q));
    }

    /** 99 */ public List<ReservationDto> listOverdueReservations() {
        LocalDate today = LocalDate.now(BOGOTA);
        return reservationJpaRepository.findAll().stream()
                .filter(r -> r.getReservationDate() != null && r.getReservationDate().isBefore(today))
                .filter(r -> r.getStatus() == CommercialStatus.CONFIRMED || r.getStatus() == CommercialStatus.SENT)
                .map(this::toReservationDto)
                .toList();
    }

    /** 100 */ public Map<String, Object> commercialDigest() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pipeline", sigOpsService.getCommercialPipelineSummary());
        out.put("avgSale", averageSaleAmount());
        out.put("avgQuote", averageQuoteAmount());
        out.put("zeroAmountQuotes", listZeroAmountQuotes().size());
        out.put("todayReservations", listConfirmedReservationsToday().size());
        out.put("overdueReservations", listOverdueReservations().size());
        out.put("conversionQuoteSalePct", sigOpsService.getConversionRateQuoteToSale());
        return out;
    }

    // ——— 101–110 Calidad / sheets readiness ———

    /** 101 */ public long conversationsMissingExternalKey() {
        return conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getExternalKey() == null || c.getExternalKey().isBlank()).count();
    }

    /** 102 */ public long clientsMissingEmail() {
        return clientRepositoryPort.findAll().stream()
                .filter(c -> c.getEmail() == null || c.getEmail().isBlank()).count();
    }

    /** 103 */ public long quotesMissingAdvisor() {
        return quoteJpaRepository.findAll().stream().filter(q -> q.getAdvisor() == null).count();
    }

    /** 104 */ public long reservationsMissingQuoteLink() {
        return reservationJpaRepository.findAll().stream().filter(r -> r.getQuote() == null).count();
    }

    /** 105 */ public long salesMissingReservationLink() {
        return saleJpaRepository.findAll().stream().filter(s -> s.getReservation() == null).count();
    }

    /** 106 */ public long orphanQuotesHint() {
        Set<UUID> linked = reservationJpaRepository.findAll().stream()
                .map(ReservationEntity::getQuote)
                .filter(Objects::nonNull)
                .map(QuoteEntity::getId)
                .collect(Collectors.toSet());
        return quoteJpaRepository.findAll().stream()
                .filter(q -> q.getStatus() == CommercialStatus.ACCEPTED)
                .filter(q -> !linked.contains(q.getId()))
                .count();
    }

    /** 107 */ public Map<String, Object> syncReadinessScore() {
        long clients = Math.max(1, clientRepositoryPort.count());
        long withPhone = clientRepositoryPort.findAll().stream()
                .filter(c -> c.getPhone() != null && !c.getPhone().isBlank()).count();
        long conv = Math.max(1, conversationRepositoryPort.count());
        long withKey = conversationRepositoryPort.findAll().stream()
                .filter(c -> c.getExternalKey() != null && !c.getExternalKey().isBlank()).count();
        double score = ((withPhone * 100.0 / clients) + (withKey * 100.0 / conv)) / 2.0;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("score", round2(score));
        out.put("clientsWithPhonePct", round2(withPhone * 100.0 / clients));
        out.put("conversationsWithExternalKeyPct", round2(withKey * 100.0 / conv));
        out.put("ready", score >= 70);
        return out;
    }

    /** 108 */ public List<OpsExtendedDtos.DuplicatePhone> listDuplicateClientPhones() {
        return duplicatePhoneCheck();
    }

    /** 109 */ public List<OpsDtos.CountByKey> conversationsByCategory() {
        return conversationRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(
                        c -> c.getCategory() == null || c.getCategory().isBlank() ? "SIN_CATEGORIA" : c.getCategory(),
                        Collectors.counting()))
                .entrySet().stream()
                .map(e -> new OpsDtos.CountByKey(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(OpsDtos.CountByKey::count).reversed())
                .toList();
    }

    /** 110 */ public List<OpsDtos.CountByKey> topCategories(int limit) {
        return conversationsByCategory().stream().limit(Math.max(1, limit)).toList();
    }

    // ——— 111–120 Reportes / usuarios / integraciones ———

    /** 111 */ public byte[] exportQuotesCsv() {
        StringBuilder sb = new StringBuilder("code,client,title,amount,status,validUntil,issuedAt\n");
        quoteJpaRepository.findAll().forEach(q -> sb.append(csv(q.getCode())).append(',')
                .append(csv(q.getClient().getName())).append(',')
                .append(csv(q.getTitle())).append(',')
                .append(csv(q.getAmount())).append(',')
                .append(csv(q.getStatus())).append(',')
                .append(csv(q.getValidUntil())).append(',')
                .append(csv(q.getIssuedAt())).append('\n'));
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** 112 */ public byte[] exportSalesCsv() {
        StringBuilder sb = new StringBuilder("code,client,concept,amount,saleDate,status,paymentMethod\n");
        saleJpaRepository.findAll().forEach(s -> sb.append(csv(s.getCode())).append(',')
                .append(csv(s.getClient().getName())).append(',')
                .append(csv(s.getConcept())).append(',')
                .append(csv(s.getAmount())).append(',')
                .append(csv(s.getSaleDate())).append(',')
                .append(csv(s.getStatus())).append(',')
                .append(csv(s.getPaymentMethod())).append('\n'));
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** 113 */ public byte[] exportReservationsCsv() {
        StringBuilder sb = new StringBuilder("code,client,experience,partySize,date,amount,status\n");
        reservationJpaRepository.findAll().forEach(r -> sb.append(csv(r.getCode())).append(',')
                .append(csv(r.getClient().getName())).append(',')
                .append(csv(r.getExperienceName())).append(',')
                .append(csv(r.getPartySize())).append(',')
                .append(csv(r.getReservationDate())).append(',')
                .append(csv(r.getAmount())).append(',')
                .append(csv(r.getStatus())).append('\n'));
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** 114 */ public byte[] exportAdvisorPerformanceCsv() {
        StringBuilder sb = new StringBuilder("advisor,openConversations,unread,sales\n");
        for (OpsDtos.AdvisorWorkload w : sigOpsService.getAdvisorWorkload()) {
            sb.append(csv(w.fullName())).append(',')
                    .append(w.openConversations()).append(',')
                    .append(w.unreadMessages()).append(',')
                    .append(w.salesCount()).append('\n');
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** 115 */ public List<UserDto> listActiveUsers() {
        return userRepositoryPort.findAll().stream().filter(UserEntity::isActive).map(userMapper::toDto).toList();
    }

    /** 116 */ public List<UserDto> listInactiveUsers() {
        return userRepositoryPort.findAll().stream().filter(u -> !u.isActive()).map(userMapper::toDto).toList();
    }

    /** 117 */ public List<OpsExtendedDtos.RoleCount> countUsersByRole() {
        return userRepositoryPort.findAll().stream()
                .collect(Collectors.groupingBy(
                        u -> u.getRole() != null ? u.getRole().getName().name() : "SIN_ROL",
                        Collectors.counting()))
                .entrySet().stream()
                .map(e -> new OpsExtendedDtos.RoleCount(e.getKey(), e.getValue()))
                .toList();
    }

    /** 118 */ public List<OpsExtendedDtos.IntegrationHealth> getIntegrationHealthSummary() {
        return integrationPorts.stream()
                .map(p -> new OpsExtendedDtos.IntegrationHealth(
                        p.code().name(),
                        p.status().name(),
                        p.code().name()))
                .toList();
    }

    /** 119 */ @Transactional
    public OpsExtendedDtos.SettingUpsertResult upsertSetting(String key, String value) {
        if (key == null || key.isBlank()) throw new BadRequestException("key requerida");
        SystemSettingEntity setting = systemSettingRepositoryPort.findBySettingKey(key.trim())
                .orElseGet(() -> SystemSettingEntity.builder()
                        .settingKey(key.trim())
                        .category(SettingCategory.GENERAL)
                        .build());
        setting.setSettingValue(value);
        systemSettingRepositoryPort.save(setting);
        audit(AuditAction.UPDATE, "SETTING", key, value);
        return new OpsExtendedDtos.SettingUpsertResult(setting.getSettingKey(), setting.getSettingValue());
    }

    /** 120 */ public OpsExtendedDtos.OperationalDigest getOperationalDigest() {
        OpsDtos.OperationalHealth h = sigOpsService.getOperationalHealth();
        OpsDtos.FunnelMetrics f = sigOpsService.getFunnelMetrics();
        Map<String, Long> pipe = sigOpsService.getCommercialPipelineSummary();
        List<String> alerts = new ArrayList<>();
        if (h.openConversations() > 50) alerts.add("Alto volumen de conversaciones abiertas");
        if (h.expiringQuotes() > 0) alerts.add(h.expiringQuotes() + " cotizaciones por vencer");
        if (listOverdueReservations().size() > 0) alerts.add(listOverdueReservations().size() + " reservas vencidas");
        if (duplicatePhoneCheck().size() > 0) alerts.add(duplicatePhoneCheck().size() + " teléfonos duplicados");
        if (h.dataQualityScore() < 70) alerts.add("Calidad de datos bajo 70%");

        Map<String, Object> health = new LinkedHashMap<>();
        health.put("clients", h.clients());
        health.put("openConversations", h.openConversations());
        health.put("pendingConversations", h.pendingConversations());
        health.put("dataQualityScore", h.dataQualityScore());

        Map<String, Object> funnel = new LinkedHashMap<>();
        funnel.put("clients", f.clients());
        funnel.put("conversations", f.conversations());
        funnel.put("quotes", f.quotes());
        funnel.put("reservations", f.reservations());
        funnel.put("sales", f.sales());
        funnel.put("quoteToSaleRate", f.quoteToSaleRate());

        Map<String, Object> pipeline = new LinkedHashMap<>(pipe);
        return new OpsExtendedDtos.OperationalDigest(health, funnel, pipeline, alerts);
    }

    // ——— helpers ———

    private void audit(AuditAction action, String entityType, String entityId, String details) {
        UserEntity user = null;
        try {
            user = currentUserService.getCurrentUser();
        } catch (Exception ignored) {
        }
        auditLogRepositoryPort.save(AuditLogEntity.builder()
                .user(user).action(action).entityType(entityType).entityId(entityId).details(details).build());
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

    private ReservationEntity reservationOrThrow(UUID id) {
        return reservationJpaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva no encontrada: " + id));
    }

    private SaleEntity saleOrThrow(UUID id) {
        return saleJpaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Venta no encontrada: " + id));
    }

    private boolean contains(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q);
    }

    private String csv(Object value) {
        if (value == null) return "";
        String s = String.valueOf(value).replace("\"", "\"\"");
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) return "\"" + s + "\"";
        return s;
    }

    private String nextCode(String prefix) {
        String stamp = LocalDate.now(BOGOTA).format(DateTimeFormatter.BASIC_ISO_DATE);
        return prefix + "-" + stamp + "-" + ThreadLocalRandom.current().nextInt(1000, 9999);
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
                e.getStatus(), e.getValidUntil(), e.getIssuedAt(), e.getCreatedAt());
    }

    private ReservationDto toReservationDto(ReservationEntity e) {
        return new ReservationDto(
                e.getId(), e.getCode(),
                e.getClient().getId(), e.getClient().getName(),
                e.getAdvisor() != null ? e.getAdvisor().getId() : null,
                e.getAdvisor() != null ? e.getAdvisor().getFullName() : null,
                e.getQuote() != null ? e.getQuote().getId() : null,
                e.getExperienceName(), e.getPartySize(), e.getReservationDate(),
                e.getAmount(), e.getStatus(), e.getNotes(), e.getCreatedAt());
    }

    private SaleDto toSaleDto(SaleEntity e) {
        return new SaleDto(
                e.getId(), e.getCode(),
                e.getClient().getId(), e.getClient().getName(),
                e.getAdvisor() != null ? e.getAdvisor().getId() : null,
                e.getAdvisor() != null ? e.getAdvisor().getFullName() : null,
                e.getReservation() != null ? e.getReservation().getId() : null,
                e.getConcept(), e.getAmount(), e.getCurrency(), e.getSaleDate(),
                e.getStatus(), e.getPaymentMethod(), e.getCreatedAt());
    }
}
