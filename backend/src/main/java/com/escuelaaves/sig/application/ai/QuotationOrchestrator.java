package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChecklistItemDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ProviderRecommendationDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.TourPrice;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.ChecklistPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.domain.rules.model.RuleContext;
import com.escuelaaves.sig.domain.rules.model.RuleResult;
import com.escuelaaves.sig.domain.rules.port.RuleEnginePort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Orquestador de cotización: interpret → rules (best-effort) → pricing catálogo → narrativa.
 * Sin @Transactional: precios vienen de archivos; evita rollback-only al loguear uso.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QuotationOrchestrator {

    private final AiProviderFactory aiProviderFactory;
    private final RuleEnginePort ruleEnginePort;
    private final TourPricingPort tourPricingPort;
    private final ChecklistPort checklistPort;
    private final RecommendationPort recommendationPort;
    private final AiObservabilityPort observabilityPort;

    public QuotationResponse orchestrate(QuotationRequest request) {
        long start = System.currentTimeMillis();
        GenerativeAiPort ai = aiProviderFactory.getActiveProvider();
        boolean success = true;
        String error = null;
        String providerId = ai.providerId();
        try {
            QuoteInterpretation interpretation = interpretWithFallback(ai, request.message());
            RuleResult rules = softRules(interpretation);
            QuoteInterpretation adjusted = applyRuleFlagsToInterpretation(interpretation, rules);
            PricedQuotation priced = priceInterpretation(adjusted, rules);

            ChecklistPort.Checklist checklist = softChecklist(priced.tourCode());
            List<RecommendationPort.ProviderRecommendation> recommendations = softProviders(priced.tourCode());

            NaturalLanguageQuotation natural = null;
            if (request.shouldGenerateNarrative()) {
                natural = narrativeWithFallback(ai, priced);
            }

            return toResponse(priced, natural, rules, checklist, recommendations);
        } catch (RuntimeException ex) {
            success = false;
            error = ex.getMessage();
            throw ex;
        } finally {
            try {
                observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                        null,
                        "/api/v1/ai/quotation",
                        "quotation",
                        providerId,
                        null,
                        System.currentTimeMillis() - start,
                        estimateTokens(request.message()),
                        success,
                        error
                ));
            } catch (Exception obsEx) {
                log.warn("[QuoteOrchestrator] obs omitido: {}", obsEx.getMessage());
            }
        }
    }

    private RuleResult softRules(QuoteInterpretation interpretation) {
        try {
            RuleContext ruleContext = new RuleContext(
                    interpretation.tour(),
                    interpretation.people(),
                    interpretation.transport(),
                    interpretation.restaurant(),
                    false,
                    0,
                    interpretation.pickup(),
                    java.util.Map.of()
            );
            return ruleEnginePort.evaluate(ruleContext);
        } catch (Exception ex) {
            log.warn("[QuoteOrchestrator] reglas omitidas: {}", ex.getMessage());
            return RuleResult.empty();
        }
    }

    private ChecklistPort.Checklist softChecklist(String tourCode) {
        try {
            return checklistPort.resolve(tourCode);
        } catch (Exception ex) {
            log.warn("[QuoteOrchestrator] checklist omitido: {}", ex.getMessage());
            return new ChecklistPort.Checklist(tourCode, "Sin checklist", List.of());
        }
    }

    private List<RecommendationPort.ProviderRecommendation> softProviders(String tourCode) {
        try {
            return recommendationPort.suggest(tourCode, null);
        } catch (Exception ex) {
            log.warn("[QuoteOrchestrator] proveedores omitidos: {}", ex.getMessage());
            return List.of();
        }
    }

    private QuoteInterpretation interpretWithFallback(GenerativeAiPort ai, String message) {
        try {
            return ai.interpretQuote(message);
        } catch (Exception ex) {
            log.warn("[QuoteOrchestrator] interpret IA falló, heuristic local: {}", ex.getMessage());
            return HeuristicQuoteInterpreter.interpret(message);
        }
    }

    private NaturalLanguageQuotation narrativeWithFallback(GenerativeAiPort ai, PricedQuotation priced) {
        try {
            return ai.generateQuotationNarrative(priced);
        } catch (Exception ex) {
            log.warn("[QuoteOrchestrator] narrativa IA falló, texto local: {}", ex.getMessage());
            String text = """
                    Cotización %s para %s personas.
                    Tour: %s %s | Transporte: %s | Restaurante: %s
                    Total: %s %s
                    """.formatted(
                    priced.tourName(),
                    priced.interpretation().people(),
                    priced.subtotalTour(),
                    priced.currency(),
                    priced.subtotalTransport(),
                    priced.subtotalRestaurant(),
                    priced.total(),
                    priced.currency()
            ).trim();
            return new NaturalLanguageQuotation(
                    "Cotización " + priced.tourName(),
                    text,
                    text
            );
        }
    }

    private QuoteInterpretation applyRuleFlagsToInterpretation(QuoteInterpretation base, RuleResult rules) {
        boolean transport = Boolean.TRUE.equals(base.transport());
        boolean restaurant = Boolean.TRUE.equals(base.restaurant());
        if (rules != null && Boolean.TRUE.equals(rules.flags().get("suggestTransport")) && !transport) {
            transport = true;
        }
        String notes = base.rawNotes();
        if (rules != null && !rules.messages().isEmpty()) {
            String extra = String.join("; ", rules.messages());
            notes = notes == null || notes.isBlank() ? extra : notes + " | " + extra;
        }
        return new QuoteInterpretation(
                base.tour(),
                base.people(),
                base.date(),
                base.pickup(),
                transport,
                restaurant,
                notes
        );
    }

    PricedQuotation priceInterpretation(QuoteInterpretation interpretation, RuleResult rules) {
        if (interpretation == null) {
            throw new BadRequestException("Interpretación vacía");
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
                        "No hay tarifa en catálogo para el tour: " + interpretation.tour()
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

        Object mode = rules != null ? rules.flags().get("transportMode") : null;
        if (transport && "PRIVATE_JEEP".equals(String.valueOf(mode))) {
            subTransport = subTransport.multiply(new BigDecimal("1.15")).setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal total = subTour.add(subTransport).add(subRestaurant);
        log.info("[QuoteOrchestrator] tour={} people={} total={} mode={}",
                tour.code(), people, total, mode);

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

    private static QuotationResponse toResponse(
            PricedQuotation priced,
            NaturalLanguageQuotation natural,
            RuleResult rules,
            ChecklistPort.Checklist checklist,
            List<RecommendationPort.ProviderRecommendation> recommendations
    ) {
        List<ChecklistItemDto> checklistDtos = checklist.items().stream()
                .map(i -> new ChecklistItemDto(i.code(), i.label(), i.category(), i.required(), i.sortOrder()))
                .toList();
        List<ProviderRecommendationDto> recDtos = recommendations.stream()
                .map(r -> new ProviderRecommendationDto(
                        r.code(), r.name(), r.category(), r.tourCode(), r.notes(), r.priority()))
                .toList();

        RuleResult safeRules = rules != null ? rules : RuleResult.empty();

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
                safeRules.appliedRuleCodes(),
                checklistDtos,
                recDtos
        );
    }

    private static Integer estimateTokens(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return Math.max(1, text.length() / 4);
    }
}
