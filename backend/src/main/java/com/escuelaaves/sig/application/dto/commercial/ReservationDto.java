package com.escuelaaves.sig.application.dto.commercial;

import com.escuelaaves.sig.domain.model.CommercialStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ReservationDto(
        UUID id,
        String code,
        UUID clientId,
        String clientName,
        UUID advisorId,
        String advisorName,
        UUID quoteId,
        String experienceName,
        int partySize,
        LocalDate reservationDate,
        BigDecimal amount,
        CommercialStatus status,
        String notes,
        Instant createdAt
) {
}
