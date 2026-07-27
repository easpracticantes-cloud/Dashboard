package com.escuelaaves.sig.application.dto.commercial;

import com.escuelaaves.sig.domain.model.CommercialStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record QuoteCreateRequest(
        @NotNull UUID clientId,
        UUID advisorId,
        @NotBlank String title,
        String description,
        @NotNull BigDecimal amount,
        String currency,
        CommercialStatus status,
        LocalDate validUntil
) {
}
