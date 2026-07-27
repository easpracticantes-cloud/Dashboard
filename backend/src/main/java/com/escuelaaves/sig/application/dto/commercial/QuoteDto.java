package com.escuelaaves.sig.application.dto.commercial;

import com.escuelaaves.sig.domain.model.CommercialStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record QuoteDto(
        UUID id,
        String code,
        UUID clientId,
        String clientName,
        UUID advisorId,
        String advisorName,
        String title,
        String description,
        BigDecimal amount,
        String currency,
        CommercialStatus status,
        LocalDate validUntil,
        LocalDate issuedAt,
        Instant createdAt
) {
}
