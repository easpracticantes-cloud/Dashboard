package com.escuelaaves.sig.domain.port.out.integration;

import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.ChatSentiment;
import com.escuelaaves.sig.domain.model.ChatSummary;

/**
 * Puerto de salida para asistencia conversacional: sugerir respuestas, resumir y
 * analizar sentimiento. Implementacion heuristica local o Claude AI cuando este conectado.
 */
public interface ChatAssistPort {

    String suggestReply(ChatQuoteContext context);

    ChatSummary summarize(ChatQuoteContext context);

    ChatSentiment analyzeSentiment(ChatQuoteContext context);
}
