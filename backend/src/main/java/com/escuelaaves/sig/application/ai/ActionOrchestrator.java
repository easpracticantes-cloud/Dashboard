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
 * Con sessionId, la ejecución real exige el confirmationId emitido en el dry-run.
 */
@Slf4j
@Service
public class ActionOrchestrator {

    private final ActionPlanInterpreter interpreter;
    private final Map<ActionToolType, AiActionTool> tools;
    private final AiProviderFactory aiProviderFactory;
    private final AiObservabilityPort observabilityPort;
    private final PendingActionConfirmationStore confirmationStore;

    public ActionOrchestrator(
            ActionPlanInterpreter interpreter,
            List<AiActionTool> toolList,
            AiProviderFactory aiProviderFactory,
            AiObservabilityPort observabilityPort,
            PendingActionConfirmationStore confirmationStore
    ) {
        this.interpreter = interpreter;
        this.aiProviderFactory = aiProviderFactory;
        this.observabilityPort = observabilityPort;
        this.confirmationStore = confirmationStore;
        Map<ActionToolType, AiActionTool> map = new EnumMap<>(ActionToolType.class);
        for (AiActionTool tool : toolList) {
            map.put(tool.type(), tool);
        }
        this.tools = Map.copyOf(map);
        log.info("[ActionOrchestrator] tools registrados={}", tools.keySet());
    }

    public ActionPlanOutcome run(String instruction, String contextJson, boolean dryRun, boolean confirm) {
        return run(instruction, contextJson, dryRun, confirm, null, null);
    }

    public ActionPlanOutcome run(
            String instruction,
            String contextJson,
            boolean dryRun,
            boolean confirm,
            String sessionId,
            String confirmationId
    ) {
        long start = System.currentTimeMillis();
        boolean success = true;
        String error = null;
        String operation = "actionsExecute";
        try {
            ActionPlanInterpreter.InterpretedPlan plan = interpreter.interpret(instruction, contextJson);
            boolean needsConfirm = plan.actions().stream().anyMatch(a -> a.tool().requiresExplicitConfirm());
            boolean boundSession = sessionId != null && !sessionId.isBlank();
            boolean executeMutations = !dryRun && confirm;
            if (needsConfirm && !dryRun) {
                if (boundSession) {
                    var pending = confirmationStore.consume(sessionId, confirmationId);
                    if (pending.isEmpty()) {
                        throw new BadRequestException(
                                "Confirma esa acción concreta (el plan que te mostré). El token no coincide o expiró."
                        );
                    }
                    executeMutations = true;
                } else if (!confirm) {
                    throw new BadRequestException(
                            "El plan incluye acciones MUTATING/EXTERNAL. "
                                    + "Confirma esa acción concreta (confirm=true) o usa dryRun=true."
                    );
                }
            }

            List<ActionStepResult> results = new ArrayList<>();
            boolean blockedByAmbiguity = false;
            for (PlannedAction action : plan.actions()) {
                AiActionTool tool = tools.get(action.tool());
                if (tool == null) {
                    results.add(ActionStepResult.fail(action.tool().name(), dryRun,
                            "No pude usar esa herramienta."));
                    continue;
                }
                if (blockedByAmbiguity && action.tool().requiresExplicitConfirm()) {
                    results.add(ActionStepResult.skipped(action.tool().name(),
                            "Hay varias coincidencias. Indica cuál (el primero, el segundo…) antes de modificar."));
                    continue;
                }
                boolean stepDryRun = dryRun || (action.tool().mutating() && !executeMutations);
                ActionStepResult result;
                try {
                    result = tool.execute(action, stepDryRun);
                } catch (Exception ex) {
                    log.warn("[ActionOrchestrator] tool={} error={}", action.tool(), ex.getMessage());
                    result = ActionStepResult.fail(action.tool().name(), stepDryRun,
                            AiUserSafeMessages.forUser(ex.getMessage()));
                }
                if (!result.success()) {
                    result = ActionStepResult.fail(result.tool(), result.dryRun(),
                            AiUserSafeMessages.forUser(result.message()));
                }
                results.add(result);
                if (isAmbiguous(result)) {
                    blockedByAmbiguity = true;
                }
                log.info("[ActionOrchestrator] tool={} success={} dryRun={}",
                        action.tool(), result.success(), result.dryRun());
            }

            boolean stillNeedsConfirm = !blockedByAmbiguity && plan.actions().stream()
                    .anyMatch(a -> a.tool().requiresExplicitConfirm());
            String issuedId = null;
            if (stillNeedsConfirm && dryRun && boundSession) {
                ActionToolType first = plan.actions().stream()
                        .map(PlannedAction::tool)
                        .filter(ActionToolType::requiresExplicitConfirm)
                        .findFirst()
                        .orElse(plan.actions().get(0).tool());
                String summary = specificSummary(instruction, results, first);
                issuedId = confirmationStore.put(sessionId, first, summary).confirmationId();
            }

            String narrative = AiUserSafeMessages.forUser(
                    narrate(instruction, plan.rationale(), results, dryRun || !executeMutations)
            );
            if (blockedByAmbiguity) {
                operation = "actionsAmbiguous";
            } else if (issuedId != null) {
                operation = "actionsPreview";
            } else if (executeMutations && !dryRun) {
                operation = "actionsConfirm";
            } else if (dryRun) {
                operation = "actionsPreview";
            }
            return new ActionPlanOutcome(
                    plan.rationale(),
                    plan.actions(),
                    results,
                    narrative,
                    executeMutations && !dryRun,
                    dryRun || !executeMutations,
                    issuedId
            );
        } catch (BadRequestException ex) {
            success = false;
            error = ex.getMessage();
            throw ex;
        } catch (RuntimeException ex) {
            success = false;
            error = ex.getMessage();
            log.warn("[ActionOrchestrator] error: {}", ex.getMessage());
            throw new BadRequestException(AiUserSafeMessages.forUser(ex.getMessage()));
        } finally {
            observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                    null,
                    "/api/v1/ai/actions/execute",
                    operation,
                    aiProviderFactory.activeType().id(),
                    null,
                    System.currentTimeMillis() - start,
                    null,
                    success,
                    AiUserSafeMessages.forLog(error)
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
                    "Redacta un resumen breve en español para el asesor del CRM. "
                            + "No inventes datos fuera del contexto. "
                            + "Si hay varias coincidencias, pide que elija (el primero, el segundo). "
                            + "Si es una simulación de cambio, describe exactamente qué se haría y pregunta si quiere continuar. "
                            + "Nunca digas solo «¿Seguro?». No incluyas SQL, tokens ni errores técnicos.",
                    sb.toString()
            );
        } catch (Exception ex) {
            log.debug("[ActionOrchestrator] narrate fallback: {}", ex.getMessage());
            return fallbackNarrative(results, simulated);
        }
    }

    private static String fallbackNarrative(List<ActionStepResult> results, boolean simulated) {
        StringBuilder sb = new StringBuilder();
        sb.append(simulated ? "Simulación lista. " : "Operación lista. ");
        for (ActionStepResult r : results) {
            if (r.message() != null && !r.message().isBlank()) {
                sb.append(AiUserSafeMessages.forUser(r.message())).append(' ');
            }
        }
        String t = sb.toString().trim();
        return t.isEmpty() ? "No pude completar esa operación." : t;
    }

    private static boolean isAmbiguous(ActionStepResult result) {
        if (result == null || result.data() == null) {
            return false;
        }
        Object flag = result.data().get("ambiguous");
        return Boolean.TRUE.equals(flag) || "true".equalsIgnoreCase(String.valueOf(flag));
    }

    private static String specificSummary(String instruction, List<ActionStepResult> results, ActionToolType first) {
        for (ActionStepResult r : results) {
            if (r != null && !r.skipped() && r.message() != null && !r.message().isBlank()
                    && r.tool() != null && r.tool().equals(first.name())) {
                String m = r.message().trim();
                return m.length() > 180 ? m.substring(0, 180) : m;
            }
        }
        String summary = first.name() + ": " + (instruction != null ? instruction.trim() : "");
        return summary.length() > 180 ? summary.substring(0, 180) : summary;
    }
}
