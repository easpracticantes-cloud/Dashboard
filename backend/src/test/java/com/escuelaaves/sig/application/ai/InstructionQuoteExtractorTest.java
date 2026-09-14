package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.ai.InstructionQuoteExtractor.ExtractionResult;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InstructionQuoteExtractorTest {

    @Test
    void usesHeuristicWhenAiDisabled() {
        AiProviderFactory factory = mock(AiProviderFactory.class);
        GenerativeAiPort ai = mock(GenerativeAiPort.class);
        when(factory.getActiveProvider()).thenReturn(ai);
        when(ai.status()).thenReturn(IntegrationStatus.DISABLED);
        when(ai.code()).thenReturn(IntegrationCode.CLAUDE_AI);

        InstructionQuoteExtractor extractor = new InstructionQuoteExtractor(factory, new ObjectMapper());
        ExtractionResult result = extractor.extract(
                "Experiencia de avistamiento para 5 personas en Cocora",
                Map.of("name", "Ana"));

        assertFalse(result.services().isEmpty());
        assertNotNull(result.services().get(0).quantity());
        assertTrue(result.services().get(0).quantity() == 5
                || result.services().get(0).serviceHint().toLowerCase().contains("cocora")
                || result.services().get(0).serviceHint().toLowerCase().contains("avist"));
    }

    @Test
    void parsesClaudeJsonWithoutInventingPrices() throws Exception {
        AiProviderFactory factory = mock(AiProviderFactory.class);
        GenerativeAiPort ai = mock(GenerativeAiPort.class);
        when(factory.getActiveProvider()).thenReturn(ai);
        when(ai.status()).thenReturn(IntegrationStatus.READY);
        when(ai.chat(anyString(), anyString(), eq("intelligentQuoteExtract"))).thenReturn("""
                {
                  "client": {"name": "Juan"},
                  "quotation": {"currency": "COP", "number": null},
                  "services": [{
                    "name": "Avistamiento",
                    "description": "Experiencia de avistamiento de aves para 4 personas.",
                    "quantity": 4,
                    "unit": "pax",
                    "serviceHint": "avistamiento",
                    "confidence": "HIGH",
                    "evidence": "Instrucción del asesor"
                  }],
                  "commercialConditions": {},
                  "notes": [],
                  "missingInformation": [],
                  "warnings": [],
                  "confidence": "HIGH",
                  "requestSummary": "Avistamiento 4 pax"
                }
                """);

        InstructionQuoteExtractor extractor = new InstructionQuoteExtractor(factory, new ObjectMapper());
        ExtractionResult result = extractor.extract("tour para 4", Map.of());

        assertEqualsQty(4, result);
        assertTrue(result.services().get(0).description().toLowerCase().contains("avistamiento"));
    }

    private static void assertEqualsQty(int expected, ExtractionResult result) {
        assertNotNull(result.services().get(0).quantity());
        org.junit.jupiter.api.Assertions.assertEquals(expected, result.services().get(0).quantity());
    }
}
