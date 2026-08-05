package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;

/**
 * Caso de uso de entrada del módulo de IA generativa (Gemini).
 * Orquesta interpretación, pricing desde PostgreSQL y narrativa.
 */
public interface AIUseCase {

    ChatResponse chat(ChatRequest request);

    QuotationResponse quotation(QuotationRequest request);

    QuoteInterpretation interpretQuote(String message);

    String summarizeConversation(String conversationText);

    ConversationClassification classifyConversation(String conversationText);

    String generateEmail(String context);

    NaturalLanguageQuotation generateQuotation(PricedQuotation priced);

    ReservationExtraction extractReservationInformation(String message);

    LanguageDetection detectLanguage(String text);

    SentimentAnalysis analyzeSentiment(String text);

    String suggestReply(String conversationText);
}
