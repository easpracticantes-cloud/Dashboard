package com.escuelaaves.sig.domain.ai.model;

/**
 * Resultado de análisis de sentimiento.
 */
public record SentimentAnalysis(
        String sentiment,
        double score,
        String intent,
        String urgency
) {
}
