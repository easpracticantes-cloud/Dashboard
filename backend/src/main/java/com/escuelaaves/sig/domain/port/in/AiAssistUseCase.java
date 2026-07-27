package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.ConversationSummary;
import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.ReplySuggestion;
import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.SentimentInsight;

import java.util.UUID;

/**
 * Caso de uso del asistente conversacional de IA sobre una conversacion.
 */
public interface AiAssistUseCase {

    ReplySuggestion suggestReply(UUID conversationId);

    ConversationSummary summarize(UUID conversationId);

    SentimentInsight analyzeSentiment(UUID conversationId);
}
