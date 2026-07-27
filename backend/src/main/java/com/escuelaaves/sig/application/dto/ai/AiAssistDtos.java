package com.escuelaaves.sig.application.dto.ai;

import java.util.List;

/**
 * DTOs del asistente conversacional de IA (respuestas sugeridas, resumen y sentimiento).
 */
public final class AiAssistDtos {

    private AiAssistDtos() {
    }

    public record ReplySuggestion(String reply, String analyzer) {
    }

    public record ConversationSummary(
            String summary,
            List<String> keyPoints,
            String nextStep,
            String analyzer
    ) {
    }

    public record SentimentInsight(
            String sentiment,
            String intent,
            String urgency,
            int score,
            List<String> signals
    ) {
    }
}
