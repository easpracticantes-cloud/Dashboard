package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;

import java.util.List;

/** Interpreta instrucción natural en un plan de herramientas (sin ejecutar). */
public interface ActionPlanInterpreter {

    InterpretedPlan interpret(String instruction, String contextJson);

    record InterpretedPlan(String rationale, List<PlannedAction> actions) {
    }

    default String catalogDescription() {
        StringBuilder sb = new StringBuilder();
        for (ActionToolType t : ActionToolType.values()) {
            sb.append("- ").append(t.name()).append(t.mutating() ? " [MUTATING]" : " [READ]").append('\n');
        }
        return sb.toString();
    }
}
