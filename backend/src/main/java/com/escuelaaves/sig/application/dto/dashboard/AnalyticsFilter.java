package com.escuelaaves.sig.application.dto.dashboard;

import java.time.LocalDate;

/**
 * Filtros combinables para analitica y overview.
 * Cualquier campo nulo / vacio se ignora.
 */
public record AnalyticsFilter(
        Integer year,
        Integer month,
        String importance,
        String status,
        String category,
        String name,
        String phone,
        LocalDate from,
        LocalDate to
) {
    public static AnalyticsFilter empty() {
        return new AnalyticsFilter(null, null, null, null, null, null, null, null, null);
    }

    public boolean isEmpty() {
        return year == null
                && month == null
                && blank(importance)
                && blank(status)
                && blank(category)
                && blank(name)
                && blank(phone)
                && from == null
                && to == null;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
