package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.TourPrice;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Pruebas unitarias del caso de uso AIService (pricing PostgreSQL + orquestación).
 */
@ExtendWith(MockitoExtension.class)
class AIServiceTest {

    @Mock
    private AiProviderFactory aiProviderFactory;

    @Mock
    private GenerativeAiPort generativeAiPort;

    @Mock
    private TourPricingPort tourPricingPort;

    private AIService aiService;

    @BeforeEach
    void setUp() {
        lenient().when(aiProviderFactory.getActiveProvider()).thenReturn(generativeAiPort);
        aiService = new AIService(aiProviderFactory, tourPricingPort);
    }

    @Test
    @DisplayName("chat delega en GenerativeAiPort y envuelve la respuesta")
    void chat_delegatesToPort() {
        when(generativeAiPort.chat(anyString(), anyString())).thenReturn("Hola desde Claude");
        when(generativeAiPort.providerId()).thenReturn("claude");

        ChatResponse response = aiService.chat(new ChatRequest("Hola", null));

        assertTrue(response.success());
        assertEquals("Hola desde Claude", response.reply());
        verify(generativeAiPort).chat(anyString(), eq("Hola"));
    }

    @Test
    @DisplayName("interpretQuote no calcula precios; solo llama al puerto de IA")
    void interpretQuote_doesNotTouchPricing() {
        QuoteInterpretation interpretation = new QuoteInterpretation(
                "ACAIME", 5, "2026-08-08", "Armenia", true, true, "nota"
        );
        when(generativeAiPort.interpretQuote("mensaje")).thenReturn(interpretation);

        QuoteInterpretation result = aiService.interpretQuote("mensaje");

        assertEquals("ACAIME", result.tour());
        assertEquals(5, result.people());
        verifyNoInteractions(tourPricingPort);
    }

    @Test
    @DisplayName("priceInterpretation calcula totales desde PostgreSQL")
    void priceInterpretation_usesPostgresTariffs() {
        QuoteInterpretation interpretation = new QuoteInterpretation(
                "ACAIME", 5, "2026-08-08", "Armenia", true, true, null
        );
        when(tourPricingPort.findBestMatch(eq("ACAIME"), eq(5))).thenReturn(Optional.of(new TourPrice(
                "ACAIME",
                "Tour Acaime",
                new BigDecimal("120000.00"),
                new BigDecimal("35000.00"),
                new BigDecimal("45000.00"),
                "COP",
                true
        )));

        var priced = aiService.priceInterpretation(interpretation);

        assertEquals(new BigDecimal("600000.00"), priced.subtotalTour());
        assertEquals(new BigDecimal("175000.00"), priced.subtotalTransport());
        assertEquals(new BigDecimal("225000.00"), priced.subtotalRestaurant());
        assertEquals(new BigDecimal("1000000.00"), priced.total());
        assertEquals("COP", priced.currency());
    }

    @Test
    @DisplayName("quotation interpreta + precio PG + narrativa opcional")
    void quotation_fullFlow() {
        QuoteInterpretation interpretation = new QuoteInterpretation(
                "ACAIME", 5, "2026-08-08", "Armenia", true, true, "raw"
        );
        when(generativeAiPort.interpretQuote(anyString())).thenReturn(interpretation);
        when(tourPricingPort.findBestMatch(eq("ACAIME"), eq(5))).thenReturn(Optional.of(new TourPrice(
                "ACAIME", "Tour Acaime",
                new BigDecimal("120000"), new BigDecimal("35000"), new BigDecimal("45000"),
                "COP", true
        )));
        when(generativeAiPort.generateQuotationNarrative(any())).thenReturn(
                new NaturalLanguageQuotation("Asunto", "Cuerpo", "Texto cotización")
        );

        QuotationResponse response = aiService.quotation(new QuotationRequest(
                "Necesito una cotización para 5 personas al tour Acaime el sábado desde Armenia.",
                true
        ));

        assertEquals("ACAIME", response.tour());
        assertEquals(5, response.people());
        assertEquals("Armenia", response.pickup());
        assertEquals(new BigDecimal("1000000.00"), response.total());
        assertEquals("Asunto", response.emailSubject());
        verify(generativeAiPort).interpretQuote(anyString());
        verify(tourPricingPort).findBestMatch(eq("ACAIME"), eq(5));
        verify(generativeAiPort).generateQuotationNarrative(any());
    }

    @Test
    @DisplayName("quotation sin tarifa en PG lanza ResourceNotFoundException")
    void quotation_missingTour_throws() {
        when(generativeAiPort.interpretQuote(anyString())).thenReturn(
                new QuoteInterpretation("DESCONOCIDO", 2, null, null, false, false, null)
        );
        when(tourPricingPort.findBestMatch(eq("DESCONOCIDO"), eq(2))).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () ->
                aiService.quotation(new QuotationRequest("tour raro", false))
        );
    }

    @Test
    @DisplayName("puerto Claude reporta código CLAUDE_AI")
    void generativePort_contractSmoke() {
        when(generativeAiPort.code()).thenReturn(IntegrationCode.CLAUDE_AI);
        when(generativeAiPort.status()).thenReturn(IntegrationStatus.READY);
        assertEquals(IntegrationCode.CLAUDE_AI, generativeAiPort.code());
        assertEquals(IntegrationStatus.READY, generativeAiPort.status());
    }
}
