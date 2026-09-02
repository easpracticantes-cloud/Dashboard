package com.escuelaaves.sig.application.ai;

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
import com.escuelaaves.sig.domain.ai.model.TourPrice;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Servicio de aplicacion del modulo de IA (capa legacy reutilizable).
 * Preferir {@link IntelligenceService} como fachada HTTP.
 * Orquesta GenerativeAiPort (vía factory) y TourPricingPort (PostgreSQL).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AIService {

    private static final String DEFAULT_SYSTEM = """
            Eres el asistente comercial de Escuela Aves Salento (SIG).
            Responde en espanol, claro y profesional. No inventes precios.
            """;

    private final AiProviderFactory aiProviderFactory;
    private final TourPricingPort tourPricingPort;

    private GenerativeAiPort ai() {
        return aiProviderFactory.getActiveProvider();
    }

    public ChatResponse chat(ChatRequest request) {
        String system = (request.systemPrompt() == null || request.systemPrompt().isBlank())
                ? DEFAULT_SYSTEM
                : request.systemPrompt();
        GenerativeAiPort generativeAiPort = ai();
        String reply = generativeAiPort.chat(system, request.message());
        return new ChatResponse(reply, generativeAiPort.providerId(), true, "OK");
    }

    public QuotationResponse quotation(QuotationRequest request) {
        QuoteInterpretation interpretation = interpretQuote(request.message());
        PricedQuotation priced = priceInterpretation(interpretation);

        boolean narrative = request.shouldGenerateNarrative();
        NaturalLanguageQuotation natural = null;
        if (narrative) {
            natural = generateQuotation(priced);
        }

        return new QuotationResponse(
                priced.interpretation().tour(),
                priced.interpretation().people(),
                priced.interpretation().date(),
                priced.interpretation().pickup(),
                priced.interpretation().transport(),
                priced.interpretation().restaurant(),
                priced.tourName(),
                priced.pricePerPerson(),
                priced.transportPerPerson(),
                priced.restaurantPerPerson(),
                priced.subtotalTour(),
                priced.subtotalTransport(),
                priced.subtotalRestaurant(),
                priced.total(),
                priced.currency(),
                natural != null ? natural.emailSubject() : null,
                natural != null ? natural.emailBody() : null,
                natural != null ? natural.quotationText() : null,
                priced.interpretation().rawNotes(),
                List.of(),
                List.of(),
                List.of()
        );
    }

    public QuoteInterpretation interpretQuote(String message) {
        log.info("[AI] interpretQuote chars={}", message != null ? message.length() : 0);
        return ai().interpretQuote(message);
    }

    public String summarizeConversation(String conversationText) {
        return ai().summarizeConversation(conversationText);
    }

    public ConversationClassification classifyConversation(String conversationText) {
        return ai().classifyConversation(conversationText);
    }

    public String generateEmail(String context) {
        return ai().generateEmail(context);
    }

    public NaturalLanguageQuotation generateQuotation(PricedQuotation priced) {
        return ai().generateQuotationNarrative(priced);
    }

    public ReservationExtraction extractReservationInformation(String message) {
        return ai().extractReservationInformation(message);
    }

    public LanguageDetection detectLanguage(String text) {
        return ai().detectLanguage(text);
    }

    public SentimentAnalysis analyzeSentiment(String text) {
        return ai().analyzeSentiment(text);
    }

    public String suggestReply(String conversationText) {
        return ai().suggestReply(conversationText);
    }

    /**
     * Calcula montos desde catálogo 2026 / PostgreSQL via TourPricingPort (escala por pax).
     */
    PricedQuotation priceInterpretation(QuoteInterpretation interpretation) {
        if (interpretation == null) {
            throw new BadRequestException("Interpretacion vacia");
        }
        int people = interpretation.people() != null && interpretation.people() > 0
                ? interpretation.people()
                : 1;
        boolean transport = Boolean.TRUE.equals(interpretation.transport());
        boolean restaurant = Boolean.TRUE.equals(interpretation.restaurant());

        String tourHint = interpretation.tour();
        String notes = interpretation.rawNotes() != null ? interpretation.rawNotes().toLowerCase() : "";
        if (notes.contains("compartido")) {
            tourHint = tourHint + " compartido";
        } else if (notes.contains("privado")) {
            tourHint = tourHint + " privado";
        }

        TourPrice tour = tourPricingPort.findBestMatch(tourHint, people)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No hay tarifa en catálogo/PostgreSQL para el tour: " + interpretation.tour()
                ));

        BigDecimal pax = BigDecimal.valueOf(people);
        BigDecimal subTour = tour.pricePerPerson().multiply(pax).setScale(2, RoundingMode.HALF_UP);
        boolean hasTransportFee = tour.transportPerPerson() != null
                && tour.transportPerPerson().compareTo(BigDecimal.ZERO) > 0;
        boolean hasRestaurantFee = tour.restaurantPerPerson() != null
                && tour.restaurantPerPerson().compareTo(BigDecimal.ZERO) > 0;
        BigDecimal subTransport = transport && hasTransportFee
                ? tour.transportPerPerson().multiply(pax).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal subRestaurant = restaurant && hasRestaurantFee
                ? tour.restaurantPerPerson().multiply(pax).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = subTour.add(subTransport).add(subRestaurant);

        log.info("[AI] Pricing tour={} people={} total={} {}", tour.code(), people, total, tour.currency());

        return new PricedQuotation(
                new QuoteInterpretation(
                        tour.code(),
                        people,
                        interpretation.date(),
                        interpretation.pickup(),
                        transport,
                        restaurant,
                        interpretation.rawNotes()
                ),
                tour.code(),
                tour.name(),
                tour.pricePerPerson(),
                tour.transportPerPerson(),
                tour.restaurantPerPerson(),
                subTour,
                subTransport,
                subRestaurant,
                total,
                tour.currency()
        );
    }
}
