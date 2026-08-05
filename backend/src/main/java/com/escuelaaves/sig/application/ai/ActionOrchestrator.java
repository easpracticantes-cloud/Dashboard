package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.ActionPlanOutcome;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.out.ActionPlanInterpreter;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Asistente operativo: interpreta instrucción → plan de tools → ejecuta (o dry-run) → narrativa.
 * Acciones mutantes requieren confirm=true (salvo dryRun).
 */
@Slf4j
@Service
public class ActionOrchestrator {

    private final ActionPlanInterpreter interpreter;
    private final Map<ActionToolType, AiActionTool> tools;
    private final AiProviderFactory aiProviderFactory;
    private final AiObservabilityPort observabilityPort;

    public ActionOrchestrator(
            ActionPlanInterpreter interpreter,
            List<AiActionTool> toolList,
            AiProviderFactory aiProviderFactory,
            AiObservabilityPort observabilityPort
    ) {
        this.interpreter = interpreter;
        this.aiProviderFactory = aiProviderFactory;
        this.observabilityPort = observabilityPort;
        Map<ActionToolType, AiActionTool> map = new EnumMap<>(ActionToolType.class);
        for (AiActionTool tool : toolList) {
            map.put(tool.type(), tool);
        }
        this.tools = Map.copyOf(map);
        log.info("[ActionOrchestrator] tools registrados={}", tools.keySet());
    }

    public ActionPlanOutcome run(String instruction, String contextJson, boolean dryRun, boolean confirm) {
        long start = System.currentTimeMillis();
        boolean success = true;
        String error = null;
        try {
            ActionPlanInterpreter.InterpretedPlan plan = interpreter.interpret(instruction, contextJson);
            boolean hasMutating = plan.actions().stream().anyMatch(a -> a.tool().mutating());
            boolean executeMutations = !dryRun && confirm;
            if (hasMutating && !dryRun && !confirm) {
                throw new BadRequestException(
                        "El plan incluye acciones mutantes. Envía confirm=true para ejecutar, o dryRun=true para simular."
                );
            }

            List<ActionStepResult> results = new ArrayList<>();
            for (PlannedAction action : plan.actions()) {
                AiActionTool tool = tools.get(action.tool());
                if (tool == null) {
                    results.add(ActionStepResult.fail(action.tool().name(), dryRun,
                            "Tool no registrado: " + action.tool()));
                    continue;
                }
                boolean stepDryRun = dryRun || (action.tool().mutating() && !executeMutations);
                ActionStepResult result = tool.execute(action, stepDryRun);
                results.add(result);
                log.info("[ActionOrchestrator] tool={} success={} dryRun={}",
                        action.tool(), result.success(), result.dryRun());
            }

            String narrative = narrate(instruction, plan.rationale(), results, dryRun || !executeMutations);
            return new ActionPlanOutcome(
                    plan.rationale(),
                    plan.actions(),
                    results,
                    narrative,
                    executeMutations && !dryRun,
                    dryRun || !executeMutations
            );
        } catch (RuntimeException ex) {
            success = false;
            error = ex.getMessage();
            throw ex;
        } finally {
            observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                    null,
                    "/api/v1/ai/actions/execute",
                    "actionsExecute",
                    aiProviderFactory.activeType().id(),
                    null,
                    System.currentTimeMillis() - start,
                    null,
                    success,
                    error
            ));
        }
    }

    private String narrate(String instruction, String rationale, List<ActionStepResult> results, boolean simulated) {
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("Instrucción: ").append(instruction).append('\n');
            sb.append("Rationale: ").append(rationale).append('\n');
            sb.append(simulated ? "Modo: SIMULACIÓN\n" : "Modo: EJECUTADO\n");
            for (ActionStepResult r : results) {
                sb.append("- ").append(r.tool()).append(": ")
                        .append(r.success() ? "OK" : "FAIL")
                        .append(" — ").append(r.message()).append('\n');
            }
            return aiProviderFactory.getActiveProvider().chat(
                    "Redacta un resumen breve en español para el asesor del CRM. No inventes datos fuera del contexto.",
                    sb.toString()
            );
        } catch (Exception ex) {
            return "Plan " + (simulated ? "simulado" : "ejecutado") + " con "
                    + results.size() + " pasos. (" + ex.getMessage() + ")";
        }
    }
}
