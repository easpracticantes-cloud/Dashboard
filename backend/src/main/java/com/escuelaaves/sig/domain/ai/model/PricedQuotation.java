package com.escuelaaves.sig.domain.ai.model;

import java.math.BigDecimal;

/**
 * Cotización con montos calculados desde PostgreSQL (nunca por la IA).
 */
public record PricedQuotation(
        QuoteInterpretation interpretation,
        String tourCode,
        String tourName,
        BigDecimal pricePerPerson,
        BigDecimal transportPerPerson,
        BigDecimal restaurantPerPerson,
        BigDecimal subtotalTour,
        BigDecimal subtotalTransport,
        BigDecimal subtotalRestaurant,
        BigDecimal total,
        String currency
) {
}
