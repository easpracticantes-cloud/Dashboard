package com.escuelaaves.sig.application.dto.commercial;

import com.escuelaaves.sig.domain.model.CommercialStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ReservationCreateRequest(
        @NotNull UUID clientId,
        UUID advisorId,
        UUID quoteId,
        @NotBlank String experienceName,
        int partySize,
        @NotNull LocalDate reservationDate,
        @NotNull BigDecimal amount,
        CommercialStatus status,
        String notes
) {
}
