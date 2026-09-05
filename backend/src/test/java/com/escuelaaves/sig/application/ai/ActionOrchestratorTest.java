package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.model.AiProviderType;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.out.ActionPlanInterpreter;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ActionOrchestratorTest {

    @Mock
    private ActionPlanInterpreter interpreter;
    @Mock
    private AiActionTool checklistTool;
    @Mock
    private AiActionTool createClientTool;
    @Mock
    private AiProviderFactory aiProviderFactory;
    @Mock
    private GenerativeAiPort generativeAiPort;
    @Mock
    private AiObservabilityPort observabilityPort;

    private ActionOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        when(checklistTool.type()).thenReturn(ActionToolType.RESOLVE_CHECKLIST);
        when(createClientTool.type()).thenReturn(ActionToolType.FIND_OR_CREATE_CLIENT);
        orchestrator = new ActionOrchestrator(
                interpreter,
                List.of(checklistTool, createClientTool),
                aiProviderFactory,
                observabilityPort
        );
        when(aiProviderFactory.activeType()).thenReturn(AiProviderType.CLAUDE);
        lenient().when(aiProviderFactory.getActiveProvider()).thenReturn(generativeAiPort);
        lenient().when(generativeAiPort.chat(anyString(), anyString())).thenReturn("Resumen OK");
    }

    @Test
    @DisplayName("dryRun ejecuta tools en modo simulación")
    void dryRun_ok() {
        when(interpreter.interpret(anyString(), any())).thenReturn(new ActionPlanInterpreter.InterpretedPlan(
                "checklist",
                List.of(new PlannedAction(ActionToolType.RESOLVE_CHECKLIST, Map.of("tourCode", "ACAIME"), "ops"))
        ));
        when(checklistTool.execute(any(), eq(true))).thenReturn(
                ActionStepResult.ok("RESOLVE_CHECKLIST", true, "sim", Map.of())
        );

        var outcome = orchestrator.run("Dame checklist Acaime", "{}", true, false);

        assertTrue(outcome.dryRun());
        assertFalse(outcome.executed());
        assertEquals(1, outcome.results().size());
        verify(checklistTool).execute(any(), eq(true));
        verify(observabilityPort).record(any());
    }

    @Test
    @DisplayName("acciones mutantes sin confirm lanzan BadRequest")
    void mutatingWithoutConfirm_throws() {
        when(interpreter.interpret(anyString(), any())).thenReturn(new ActionPlanInterpreter.InterpretedPlan(
                "crear cliente",
                List.of(new PlannedAction(ActionToolType.FIND_OR_CREATE_CLIENT,
                        Map.of("phone", "3001234567"), "crm"))
        ));

        assertThrows(BadRequestException.class, () ->
                orchestrator.run("Crea cliente 3001234567", "{}", false, false)
        );
        verify(createClientTool, never()).execute(any(), anyBoolean());
    }

    @Test
    @DisplayName("confirm=true ejecuta mutaciones")
    void confirm_executes() {
        when(interpreter.interpret(anyString(), any())).thenReturn(new ActionPlanInterpreter.InterpretedPlan(
                "crear cliente",
                List.of(new PlannedAction(ActionToolType.FIND_OR_CREATE_CLIENT,
                        Map.of("phone", "3001234567", "name", "Ana"), "crm"))
        ));
        when(createClientTool.execute(any(), eq(false))).thenReturn(
                ActionStepResult.ok("FIND_OR_CREATE_CLIENT", false, "Cliente listo", Map.of("clientId", "x"))
        );

        var outcome = orchestrator.run("Crea cliente Ana", "{}", false, true);

        assertTrue(outcome.executed());
        assertFalse(outcome.dryRun());
        verify(createClientTool).execute(any(), eq(false));
    }
}
