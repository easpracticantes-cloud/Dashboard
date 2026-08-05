package com.escuelaaves.sig.domain.ai.model;

/**
 * Clasificación comercial de una conversación.
 */
public record ConversationClassification(
        String category,
        String intent,
        String urgency,
        String rationale
) {
}
