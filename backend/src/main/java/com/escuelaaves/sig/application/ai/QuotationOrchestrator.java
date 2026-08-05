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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Orquestador enterprise de cotización:
 * interpret (IA) → rules (PG) → pricing (PG) → checklist → recommendations → narrative (IA) → obs.
 * La IA nunca calcula precios.
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

    @Transactional(readOnly = true)
    public QuotationResponse orchestrate(QuotationRequest request) {
        long start = System.currentTimeMillis();
        GenerativeAiPort ai = aiProviderFactory.getActiveProvider();
        boolean success = true;
        String error = null;
        try {
            QuoteInterpretation interpretation = ai.interpretQuote(request.message());
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
            RuleResult rules = ruleEnginePort.evaluate(ruleContext);

            QuoteInterpretation adjusted = applyRuleFlagsToInterpretation(interpretation, rules);
            PricedQuotation priced = priceInterpretation(adjusted, rules);

            ChecklistPort.Checklist checklist = checklistPort.resolve(priced.tourCode());
            List<RecommendationPort.ProviderRecommendation> recommendations = recommendationPort.suggest(
                    priced.tourCode(), null);

            NaturalLanguageQuotation natural = null;
            if (request.shouldGenerateNarrative()) {
                natural = ai.generateQuotationNarrative(priced);
            }

            return toResponse(priced, natural, rules, checklist, recommendations);
        } catch (RuntimeException ex) {
            success = false;
            error = ex.getMessage();
            throw ex;
        } finally {
            observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                    null,
                    "/api/v1/ai/quotation",
                    "quotation",
                    ai.providerId(),
                    null,
                    System.currentTimeMillis() - start,
                    estimateTokens(request.message()),
                    success,
                    error
            ));
        }
    }

    private QuoteInterpretation applyRuleFlagsToInterpretation(QuoteInterpretation base, RuleResult rules) {
        boolean transport = Boolean.TRUE.equals(base.transport());
        boolean restaurant = Boolean.TRUE.equals(base.restaurant());
        if (Boolean.TRUE.equals(rules.flags().get("suggestTransport")) && !transport) {
            transport = true;
        }
        String notes = base.rawNotes();
        if (!rules.messages().isEmpty()) {
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

        TourPrice tour = tourPricingPort.findBestMatch(interpretation.tour())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No hay tarifa en PostgreSQL para el tour: " + interpretation.tour()
                ));

        BigDecimal pax = BigDecimal.valueOf(people);
        BigDecimal subTour = tour.pricePerPerson().multiply(pax).setScale(2, RoundingMode.HALF_UP);
        BigDecimal subTransport = transport
                ? tour.transportPerPerson().multiply(pax).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal subRestaurant = restaurant
                ? tour.restaurantPerPerson().multiply(pax).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        // Amplificación suave según reglas (modo privado jeep: +15% transporte)
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
                rules.appliedRuleCodes(),
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
