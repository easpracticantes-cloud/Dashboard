package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.commercial.*;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.*;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.QuoteJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.ReservationJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.SaleJpaRepository;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommercialService {

    private final QuoteJpaRepository quoteJpaRepository;
    private final ReservationJpaRepository reservationJpaRepository;
    private final SaleJpaRepository saleJpaRepository;
    private final ClientRepositoryPort clientRepositoryPort;
    private final UserRepositoryPort userRepositoryPort;

    public List<QuoteDto> listQuotes() {
        return quoteJpaRepository.findAll().stream()
                .sorted((a, b) -> {
                    LocalDate da = a.getIssuedAt();
                    LocalDate db = b.getIssuedAt();
                    if (da == null && a.getCreatedAt() != null) {
                        da = a.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
                    }
                    if (db == null && b.getCreatedAt() != null) {
                        db = b.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
                    }
                    if (da == null && db == null) return 0;
                    if (da == null) return 1;
                    if (db == null) return -1;
                    return db.compareTo(da);
                })
                .map(this::toQuoteDto)
                .toList();
    }

    public List<ReservationDto> listReservations() {
        return reservationJpaRepository.findAll().stream().map(this::toReservationDto).toList();
    }

    public List<SaleDto> listSales() {
        return saleJpaRepository.findAll().stream().map(this::toSaleDto).toList();
    }

    public long countQuotes() {
        return quoteJpaRepository.count();
    }

    public long countReservations() {
        return reservationJpaRepository.count();
    }

    public long countSales() {
        return saleJpaRepository.count();
    }

    @Transactional
    public QuoteDto createQuote(QuoteCreateRequest request) {
        ClientEntity client = clientRepositoryPort.findById(request.clientId())
                .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado"));
        UserEntity advisor = resolveUser(request.advisorId());
        QuoteEntity entity = QuoteEntity.builder()
                .code(nextCode("COT"))
                .client(client)
                .advisor(advisor)
                .title(request.title())
                .description(request.description())
                .amount(request.amount())
                .currency(request.currency() != null ? request.currency() : "COP")
                .status(request.status() != null ? request.status() : CommercialStatus.DRAFT)
                .validUntil(request.validUntil())
                .build();
        return toQuoteDto(quoteJpaRepository.save(entity));
    }

    @Transactional
    public ReservationDto createReservation(ReservationCreateRequest request) {
        ClientEntity client = clientRepositoryPort.findById(request.clientId())
                .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado"));
        UserEntity advisor = resolveUser(request.advisorId());
        QuoteEntity quote = request.quoteId() != null
                ? quoteJpaRepository.findById(request.quoteId()).orElse(null)
                : null;
        ReservationEntity entity = ReservationEntity.builder()
                .code(nextCode("RES"))
                .client(client)
                .advisor(advisor)
                .quote(quote)
                .experienceName(request.experienceName())
                .partySize(Math.max(1, request.partySize()))
                .reservationDate(request.reservationDate())
                .amount(request.amount())
                .status(request.status() != null ? request.status() : CommercialStatus.CONFIRMED)
                .notes(request.notes())
                .build();
        return toReservationDto(reservationJpaRepository.save(entity));
    }

    @Transactional
    public SaleDto createSale(SaleCreateRequest request) {
        ClientEntity client = clientRepositoryPort.findById(request.clientId())
                .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado"));
        UserEntity advisor = resolveUser(request.advisorId());
        ReservationEntity reservation = request.reservationId() != null
                ? reservationJpaRepository.findById(request.reservationId()).orElse(null)
                : null;
        SaleEntity entity = SaleEntity.builder()
                .code(nextCode("VTA"))
                .client(client)
                .advisor(advisor)
                .reservation(reservation)
                .concept(request.concept())
                .amount(request.amount())
                .currency(request.currency() != null ? request.currency() : "COP")
                .saleDate(request.saleDate() != null ? request.saleDate() : LocalDate.now())
                .status(request.status() != null ? request.status() : CommercialStatus.COMPLETED)
                .paymentMethod(request.paymentMethod())
                .build();
        return toSaleDto(saleJpaRepository.save(entity));
    }

    @Transactional
    public void deleteQuote(UUID id) {
        quoteJpaRepository.deleteById(id);
    }

    @Transactional
    public void deleteReservation(UUID id) {
        reservationJpaRepository.deleteById(id);
    }

    @Transactional
    public void deleteSale(UUID id) {
        saleJpaRepository.deleteById(id);
    }

    private UserEntity resolveUser(UUID id) {
        if (id == null) return null;
        return userRepositoryPort.findById(id).orElse(null);
    }

    private String nextCode(String prefix) {
        String stamp = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        int rnd = ThreadLocalRandom.current().nextInt(1000, 9999);
        return prefix + "-" + stamp + "-" + rnd;
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

    private SaleDto toSaleDto(SaleEntity e) {
        return new SaleDto(
                e.getId(), e.getCode(),
                e.getClient().getId(), e.getClient().getName(),
                e.getAdvisor() != null ? e.getAdvisor().getId() : null,
                e.getAdvisor() != null ? e.getAdvisor().getFullName() : null,
                e.getReservation() != null ? e.getReservation().getId() : null,
                e.getConcept(), e.getAmount(), e.getCurrency(), e.getSaleDate(),
                e.getStatus(), e.getPaymentMethod(), e.getCreatedAt()
        );
    }
}
