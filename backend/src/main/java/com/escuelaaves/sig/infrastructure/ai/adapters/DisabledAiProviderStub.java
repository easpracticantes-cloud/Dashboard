package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.shared.exception.BadRequestException;

/**
 * Base para proveedores aún no productivos (OpenAI / Claude / DeepSeek).
 */
public abstract class DisabledAiProviderStub implements GenerativeAiPort {

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.DISABLED;
    }

    @Override
    public String chat(String systemPrompt, String userMessage) {
        throw disabled();
    }

    @Override
    public QuoteInterpretation interpretQuote(String message) {
        throw disabled();
    }

    @Override
    public String summarizeConversation(String conversationText) {
        throw disabled();
    }

    @Override
    public ConversationClassification classifyConversation(String conversationText) {
        throw disabled();
    }

    @Override
    public String generateEmail(String context) {
        throw disabled();
    }

    @Override
    public NaturalLanguageQuotation generateQuotationNarrative(PricedQuotation priced) {
        throw disabled();
    }

    @Override
    public ReservationExtraction extractReservationInformation(String message) {
        throw disabled();
    }

    @Override
    public LanguageDetection detectLanguage(String text) {
        throw disabled();
    }

    @Override
    public SentimentAnalysis analyzeSentiment(String text) {
        throw disabled();
    }

    @Override
    public String suggestReply(String conversationText) {
        throw disabled();
    }

    private BadRequestException disabled() {
        return new BadRequestException(
                "Proveedor IA '" + providerId() + "' no está habilitado. Configure app.ai.provider=gemini y GEMINI_API_KEY."
        );
    }
}
