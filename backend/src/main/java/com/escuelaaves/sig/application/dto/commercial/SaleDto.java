package com.escuelaaves.sig.application.dto.commercial;

import com.escuelaaves.sig.domain.model.CommercialStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record SaleDto(
        UUID id,
        String code,
        UUID clientId,
        String clientName,
        UUID advisorId,
        String advisorName,
        UUID reservationId,
        String concept,
        BigDecimal amount,
        String currency,
        LocalDate saleDate,
        CommercialStatus status,
        String paymentMethod,
        Instant createdAt
) {
}
