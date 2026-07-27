package com.escuelaaves.sig.domain.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Resultado del analisis de una conversacion para armar una cotizacion.
 * Es agnostico de la tecnologia (heuristica local o Claude AI) que lo produce.
 */
public record QuoteAnalysis(
        String experience,
        String title,
        String description,
        int partySize,
        BigDecimal amount,
        String currency,
        LocalDate serviceDate,
        LocalDate validUntil,
        int confidence,
        String analyzer,
        List<String> highlights
) {
}
