package com.escuelaaves.sig.domain.ai.model;

import java.math.BigDecimal;

/**
 * Precio de un tour leído desde PostgreSQL.
 */
public record TourPrice(
        String code,
        String name,
        BigDecimal pricePerPerson,
        BigDecimal transportPerPerson,
        BigDecimal restaurantPerPerson,
        String currency,
        boolean active
) {
}
