package com.escuelaaves.sig.domain.ai.model;

import java.util.Map;

public record ActionStepResult(
        String tool,
        boolean success,
        boolean skipped,
        boolean dryRun,
        String message,
        Map<String, Object> data
) {
    public static ActionStepResult ok(String tool, boolean dryRun, String message, Map<String, Object> data) {
        return new ActionStepResult(tool, true, false, dryRun, message, data != null ? data : Map.of());
    }

    public static ActionStepResult skipped(String tool, String message) {
        return new ActionStepResult(tool, true, true, true, message, Map.of());
    }

    public static ActionStepResult fail(String tool, boolean dryRun, String message) {
        return new ActionStepResult(tool, false, false, dryRun, message, Map.of());
    }
}
