package com.escuelaaves.sig.domain.ai.model;

import java.util.Map;

public record PlannedAction(
        ActionToolType tool,
        Map<String, Object> args,
        String rationale
) {
    public PlannedAction {
        if (args == null) {
            args = Map.of();
        }
    }
}
