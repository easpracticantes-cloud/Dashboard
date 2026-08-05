package com.escuelaaves.sig.domain.ai.model;

/**
 * Interpretación estructurada de una solicitud de cotización.
 * Producida por la IA; los precios se calculan aparte en dominio/aplicación.
 */
public record QuoteInterpretation(
        String tour,
        Integer people,
        String date,
        String pickup,
        Boolean transport,
        Boolean restaurant,
        String rawNotes
) {
}
