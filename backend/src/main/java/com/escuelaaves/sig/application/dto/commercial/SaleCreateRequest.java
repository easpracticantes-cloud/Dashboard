package com.escuelaaves.sig.application.dto.commercial;

import com.escuelaaves.sig.domain.model.CommercialStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record SaleCreateRequest(
        @NotNull UUID clientId,
        UUID advisorId,
        UUID reservationId,
        @NotBlank String concept,
        @NotNull BigDecimal amount,
        String currency,
        @NotNull LocalDate saleDate,
        CommercialStatus status,
        String paymentMethod
) {
}
