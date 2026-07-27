package com.escuelaaves.sig.domain.model;

import java.util.List;

/**
 * Analisis de sentimiento, intencion y urgencia de una conversacion.
 * sentiment: POSITIVO | NEUTRO | RIESGO
 * urgency:   ALTA | MEDIA | BAJA
 */
public record ChatSentiment(
        String sentiment,
        String intent,
        String urgency,
        int score,
        List<String> signals
) {
}
