package com.escuelaaves.sig.infrastructure.ai.config;

import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DefaultAiProviderFactoryTest {

    @Test
    void failsoverFromDisabledAnthropicToReadyGemini() {
        GenerativeAiPort claude = stub("claude", IntegrationStatus.DISABLED);
        GenerativeAiPort gemini = stub("gemini", IntegrationStatus.READY);

        DefaultAiProviderFactory factory = new DefaultAiProviderFactory(
                List.of(claude, gemini),
                "anthropic"
        );

        assertEquals("gemini", factory.getActiveProvider().providerId());
        assertEquals("gemini", factory.activeType().id());
    }

    @Test
    void prefersConfiguredAnthropicWhenReady() {
        GenerativeAiPort claude = stub("claude", IntegrationStatus.READY);
        GenerativeAiPort gemini = stub("gemini", IntegrationStatus.READY);

        DefaultAiProviderFactory factory = new DefaultAiProviderFactory(
                List.of(claude, gemini),
                "anthropic"
        );

        assertEquals("claude", factory.getActiveProvider().providerId());
    }

    private static GenerativeAiPort stub(String id, IntegrationStatus status) {
        return new GenerativeAiPort() {
            @Override
            public IntegrationCode code() {
                return "claude".equals(id) ? IntegrationCode.CLAUDE_AI : IntegrationCode.GEMINI_AI;
            }

            @Override
            public IntegrationStatus status() {
                return status;
            }

            @Override
            public String providerId() {
                return id;
            }

            @Override
            public String chat(String systemPrompt, String userMessage) {
                return "ok-" + id;
            }

            @Override
            public QuoteInterpretation interpretQuote(String message) {
                throw new UnsupportedOperationException();
            }

            @Override
            public String summarizeConversation(String conversationText) {
                throw new UnsupportedOperationException();
            }

            @Override
            public ConversationClassification classifyConversation(String conversationText) {
                throw new UnsupportedOperationException();
            }

            @Override
            public String generateEmail(String context) {
                throw new UnsupportedOperationException();
            }

            @Override
            public NaturalLanguageQuotation generateQuotationNarrative(PricedQuotation priced) {
                throw new UnsupportedOperationException();
            }

            @Override
            public ReservationExtraction extractReservationInformation(String message) {
                throw new UnsupportedOperationException();
            }

            @Override
            public LanguageDetection detectLanguage(String text) {
                throw new UnsupportedOperationException();
            }

            @Override
            public SentimentAnalysis analyzeSentiment(String text) {
                throw new UnsupportedOperationException();
            }

            @Override
            public String suggestReply(String conversationText) {
                throw new UnsupportedOperationException();
            }
        };
    }
}
