package com.escuelaaves.sig.domain.ai.port;

import com.escuelaaves.sig.domain.ai.port.out.ConversationClassifier;
import com.escuelaaves.sig.domain.ai.port.out.EmailGenerator;
import com.escuelaaves.sig.domain.ai.port.out.GenerativeChatProvider;
import com.escuelaaves.sig.domain.ai.port.out.IntentDetectionProvider;
import com.escuelaaves.sig.domain.ai.port.out.LanguageDetector;
import com.escuelaaves.sig.domain.ai.port.out.QuotationGenerator;
import com.escuelaaves.sig.domain.ai.port.out.QuotationInterpreter;
import com.escuelaaves.sig.domain.ai.port.out.ReplySuggestionGenerator;
import com.escuelaaves.sig.domain.ai.port.out.ReservationExtractor;
import com.escuelaaves.sig.domain.ai.port.out.SentimentAnalyzer;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;

/**
 * Fachada del proveedor de IA generativa (Strategy).
 * Compone los puertos finos para no forzar a la aplicación a conocer el vendor.
 */
public interface GenerativeAiPort extends
        GenerativeChatProvider,
        QuotationInterpreter,
        QuotationGenerator,
        EmailGenerator,
        LanguageDetector,
        SentimentAnalyzer,
        ReplySuggestionGenerator,
        ReservationExtractor,
        ConversationClassifier,
        IntentDetectionProvider {

    IntegrationCode code();

    IntegrationStatus status();

    /** Identificador del proveedor: claude | openai | deepseek */
    String providerId();

    String summarizeConversation(String conversationText);

    /**
     * Chat con operación etiquetada para routing de modelo (Haiku vs Sonnet).
     * Default: delega a {@link #chat(String, String)}.
     */
    default String chat(String systemPrompt, String userMessage, String operation) {
        return chat(systemPrompt, userMessage);
    }

    default String detectIntent(String text) {
        return classifyConversation(text).intent();
    }
}
