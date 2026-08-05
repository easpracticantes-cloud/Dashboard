package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.TourPrice;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.ChecklistPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.domain.rules.model.RuleResult;
import com.escuelaaves.sig.domain.rules.port.RuleEnginePort;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QuotationOrchestratorTest {

    @Mock
    private AiProviderFactory aiProviderFactory;
    @Mock
    private GenerativeAiPort generativeAiPort;
    @Mock
    private RuleEnginePort ruleEnginePort;
    @Mock
    private TourPricingPort tourPricingPort;
    @Mock
    private ChecklistPort checklistPort;
    @Mock
    private RecommendationPort recommendationPort;
    @Mock
    private AiObservabilityPort observabilityPort;

    private QuotationOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        orchestrator = new QuotationOrchestrator(
                aiProviderFactory, ruleEnginePort, tourPricingPort,
                checklistPort, recommendationPort, observabilityPort
        );
        when(aiProviderFactory.getActiveProvider()).thenReturn(generativeAiPort);
        when(generativeAiPort.providerId()).thenReturn("gemini");
    }

    @Test
    @DisplayName("orchestrate: interpret -> rules -> price PG -> checklist -> narrative")
    void orchestrate_fullFlow() {
        when(generativeAiPort.interpretQuote(anyString())).thenReturn(
                new QuoteInterpretation("ACAIME", 5, "2026-08-08", "Armenia", true, true, "raw")
        );
        when(ruleEnginePort.evaluate(any())).thenReturn(new RuleResult(
                List.of("JEEP_PRIVATE_GT4"),
                List.of("Jeep privado"),
                Map.of("transportMode", "PRIVATE_JEEP"),
                Map.of()
        ));
        when(tourPricingPort.findBestMatch("ACAIME")).thenReturn(Optional.of(new TourPrice(
                "ACAIME", "Tour Acaime",
                new BigDecimal("120000"), new BigDecimal("35000"), new BigDecimal("45000"),
                "COP", true
        )));
        when(checklistPort.resolve("ACAIME")).thenReturn(new ChecklistPort.Checklist(
                "ACAIME", "Checklist Acaime",
                List.of(new ChecklistPort.ChecklistItem("CONFIRM_PAX", "Confirmar pax", "OPS", true, 10))
        ));
        when(recommendationPort.suggest(eq("ACAIME"), isNull())).thenReturn(List.of(
                new RecommendationPort.ProviderRecommendation(
                        "GUIDE_BIRD_01", "Guia EAS", "GUIDE", "ACAIME", "oficial", 95)
        ));
        when(generativeAiPort.generateQuotationNarrative(any())).thenReturn(
                new NaturalLanguageQuotation("Asunto", "Cuerpo", "Texto")
        );

        QuotationResponse response = orchestrator.orchestrate(new QuotationRequest(
                "5 personas Acaime con transporte y almuerzo", true
        ));

        assertEquals("ACAIME", response.tour());
        assertEquals(5, response.people());
        assertNotNull(response.rulesApplied());
        assertTrue(response.rulesApplied().contains("JEEP_PRIVATE_GT4"));
        assertFalse(response.checklist().isEmpty());
        assertFalse(response.recommendations().isEmpty());
        assertEquals("Asunto", response.emailSubject());
        // jeep privado amplifica transporte 15%
        assertEquals(new BigDecimal("201250.00"), response.subtotalTransport());
        verify(observabilityPort).record(any());
        verify(generativeAiPort, never()).chat(anyString(), anyString());
    }

    @Test
    @DisplayName("IA no calcula precios: montos vienen de TourPricingPort")
    void pricing_onlyFromPostgres() {
        when(generativeAiPort.interpretQuote(anyString())).thenReturn(
                new QuoteInterpretation("CAFE", 2, null, null, false, false, null)
        );
        when(ruleEnginePort.evaluate(any())).thenReturn(RuleResult.empty());
        when(tourPricingPort.findBestMatch("CAFE")).thenReturn(Optional.of(new TourPrice(
                "CAFE", "Tour Cafe",
                new BigDecimal("85000"), BigDecimal.ZERO, BigDecimal.ZERO, "COP", true
        )));
        when(checklistPort.resolve("CAFE")).thenReturn(new ChecklistPort.Checklist("CAFE", "n/a", List.of()));
        when(recommendationPort.suggest(eq("CAFE"), isNull())).thenReturn(List.of());

        QuotationResponse response = orchestrator.orchestrate(new QuotationRequest("cafe x2", false));

        assertEquals(new BigDecimal("170000.00"), response.total());
        verify(generativeAiPort, never()).generateQuotationNarrative(any());
    }
}
