package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;

/**
 * Herramienta ejecutable (Strategy). Cada tool encapsula un caso de uso del CRM.
 */
public interface AiActionTool {

    ActionToolType type();

    ActionStepResult execute(PlannedAction action, boolean dryRun);
}
