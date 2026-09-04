package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.domain.ai.model.AiProviderType;
import com.escuelaaves.sig.domain.ai.model.SessionSlotState;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.ConversationMemoryPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Prueba de causa: el SYSTEM que llega al proveedor en turnos generales
 * no puede llevar identidad comercial ni catálogo.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CopilotOrchestratorPromptTest {

    @Mock AiProviderFactory aiProviderFactory;
    @Mock GenerativeAiPort generativeAiPort;
    @Mock CatalogQuoteService catalogQuoteService;
    @Mock RecommendationPort recommendationPort;
    @Mock CommercialCatalogService commercialCatalog;
    @Mock ContextRetriever contextRetriever;
    @Mock SessionSlotStore sessionSlotStore;
    @Mock ConversationMemoryPort memoryPort;
    @Mock AiObservabilityPort observabilityPort;

    CopilotOrchestrator orchestrator;
    AtomicReference<String> capturedSystem = new AtomicReference<>();
    AtomicReference<String> capturedUser = new AtomicReference<>();

    @BeforeEach
    void setUp() {
        when(aiProviderFactory.activeType()).thenReturn(AiProviderType.CLAUDE);
        when(aiProviderFactory.getActiveProvider()).thenReturn(generativeAiPort);
        when(generativeAiPort.providerId()).thenReturn("claude");
        stubChat(sysUser -> "Albert Einstein fue un físico teórico.");
        when(aiProviderFactory.findAlternateReady(any())).thenReturn(Optional.empty());
        when(sessionSlotStore.getOrCreate(anyString())).thenReturn(new SessionSlotState());
        when(memoryPort.findSession(any())).thenReturn(Optional.empty());
        when(memoryPort.startSession(any(), anyString())).thenReturn("sess-new");
        when(memoryPort.recentMessages(anyString(), anyInt())).thenReturn(List.of());
        lenient().doNothing().when(memoryPort).appendMessage(anyString(), anyString(), anyString());
        lenient().doNothing().when(observabilityPort).record(any());

        orchestrator = new CopilotOrchestrator(
                aiProviderFactory,
                catalogQuoteService,
                recommendationPort,
                commercialCatalog,
                contextRetriever,
                sessionSlotStore,
                memoryPort,
                observabilityPort,
                new ObjectMapper()
        );
    }

    /** Stub 2-arg y 3-arg: el default de GenerativeAiPort puede o no ejecutarse según Mockito. */
    private void stubChat(Function<String, String> replyForSystem) {
        org.mockito.stubbing.Answer<String> answer = inv -> {
            String system = inv.getArgument(0);
            String user = inv.getArgument(1);
            capturedSystem.set(system);
            capturedUser.set(user);
            return replyForSystem.apply(system);
        };
        when(generativeAiPort.chat(anyString(), anyString())).thenAnswer(answer);
        when(generativeAiPort.chat(anyString(), anyString(), anyString())).thenAnswer(answer);
    }

    @Test
    void einsteinSendsOnlyGeneralSystemToProvider() {
        var res = orchestrator.chat(new CopilotRequest("¿Quién fue Einstein?", null));
        assertTrue(res.success(), () -> "reply=" + res.reply());
        assertEquals(AveSystemPrompt.SYSTEM, capturedSystem.get());
        assertFalse(AvePromptAssembler.containsCommercialIdentity(capturedSystem.get()));
        assertFalse(capturedSystem.get().toLowerCase().contains("escuela"));
        assertFalse(capturedSystem.get().toLowerCase().contains("tour"));
        assertFalse(capturedSystem.get().toLowerCase().contains("cancha"));
        assertTrue(capturedUser.get().contains("Einstein"));
        assertFalse(res.reply().toLowerCase().contains("cancha"));
    }

    @Test
    void dockerSendsOnlyGeneralSystem() {
        stubChat(sys -> "Docker empaqueta aplicaciones en contenedores.");
        orchestrator.chat(new CopilotRequest("¿Cómo funciona Docker?", null));
        assertEquals(AveSystemPrompt.SYSTEM, capturedSystem.get());
    }

    @Test
    void businessTurnAttachesSigAppendix() {
        stubChat(sys -> "Tenemos trekking Acaime y Cocora.");
        when(contextRetriever.buildCompactContext(anyString(), any(), anyInt(), anyInt()))
                .thenReturn("CATALOGO: ACAIME");
        orchestrator.chat(new CopilotRequest("¿Qué tours de trekking tenemos?", null));
        assertTrue(capturedSystem.get().contains("Herramientas de negocio"));
        assertTrue(capturedSystem.get().contains("ACAIME"));
        verify(contextRetriever).buildCompactContext(anyString(), any(), anyInt(), anyInt());
    }

    @Test
    void contaminatedHistoryDoesNotEnterSystem() {
        when(memoryPort.findSession(eq("sess-dirty"))).thenReturn(Optional.of("sess-dirty"));
        when(memoryPort.recentMessages(eq("sess-dirty"), anyInt())).thenReturn(List.of(
                new ConversationMemoryPort.MemoryMessage("user", "¿Qué tours tenemos?"),
                new ConversationMemoryPort.MemoryMessage("assistant",
                        "Soy Ave, asistente de Escuela Aves Salento. Estoy enfocada en tours y reservas.")
        ));
        stubChat(sys -> "Albert Einstein (1879–1955) fue un físico teórico.");

        orchestrator.chat(new CopilotRequest("¿Quién fue Einstein?", "sess-dirty"));

        assertEquals(AveSystemPrompt.SYSTEM, capturedSystem.get());
        assertFalse(AvePromptAssembler.containsCommercialIdentity(capturedSystem.get()));
        assertTrue(capturedUser.get().contains(AveHistorySanitizer.OMITTED)
                || !capturedUser.get().toLowerCase().contains("escuela aves salento"));
    }

    @Test
    void commercialRefusalTriggersHistorylessRetry() {
        when(generativeAiPort.chat(anyString(), anyString()))
                .thenReturn("eso está un poco fuera de mi cancha. Yo soy Ave, asistente de Escuela Aves Salento…")
                .thenReturn("Albert Einstein fue un físico teórico alemán.");
        when(generativeAiPort.chat(anyString(), anyString(), anyString()))
                .thenReturn("eso está un poco fuera de mi cancha. Yo soy Ave, asistente de Escuela Aves Salento…")
                .thenReturn("Albert Einstein fue un físico teórico alemán.");

        var res = orchestrator.chat(new CopilotRequest("¿Quién fue Einstein?", null));

        ArgumentCaptor<String> sys = ArgumentCaptor.forClass(String.class);
        verify(generativeAiPort, atLeast(2)).chat(sys.capture(), anyString(), anyString());
        assertTrue(res.reply().contains("Einstein"));
        assertFalse(res.reply().toLowerCase().contains("cancha"));
        assertEquals(AveSystemPrompt.SYSTEM, sys.getAllValues().get(1));
    }
}
