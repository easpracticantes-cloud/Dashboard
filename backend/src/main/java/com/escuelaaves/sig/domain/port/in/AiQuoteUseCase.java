package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.GenerateQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.QuoteSuggestion;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;

import java.util.UUID;

/**
 * Caso de uso del asistente de IA para cotizaciones desde conversaciones (WhatsApp/Sheets).
 */
public interface AiQuoteUseCase {

    /** Analiza el chat y responde si conviene ofrecer generar la cotización, con un borrador. */
    QuoteSuggestion suggestForConversation(UUID conversationId);

    /** Genera y persiste la cotización a partir del chat (aplicando ajustes opcionales). */
    QuoteDto generateForConversation(UUID conversationId, GenerateQuoteRequest overrides);

    /** Exporta una cotización a PDF. */
    byte[] exportQuotePdf(UUID quoteId);
}
