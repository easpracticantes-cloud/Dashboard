package com.escuelaaves.sig.domain.ai.model;

import java.util.List;

public record ActionPlanOutcome(
        String rationale,
        List<PlannedAction> plan,
        List<ActionStepResult> results,
        String narrative,
        boolean executed,
        boolean dryRun
) {
}
