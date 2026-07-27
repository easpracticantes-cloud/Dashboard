package com.escuelaaves.sig.application.dto.ai;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * DTOs del asistente de IA para cotizaciones a partir de conversaciones.
 */
public final class AiQuoteDtos {

    private AiQuoteDtos() {
    }

    /** Borrador propuesto por la IA (editable por el asesor antes de guardar). */
    public record QuoteDraft(
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

    /** Respuesta de "¿quieres hacer la cotización?" para una conversación. */
    public record QuoteSuggestion(
            boolean shouldAsk,
            String question,
            String reason,
            UUID conversationId,
            String clientName,
            QuoteDraft draft
    ) {
    }

    /** Ajustes opcionales que el asesor puede sobreescribir al confirmar. */
    public record GenerateQuoteRequest(
            String title,
            String experience,
            String description,
            BigDecimal amount,
            String currency,
            Integer partySize,
            LocalDate serviceDate,
            UUID advisorId
    ) {
    }
}
