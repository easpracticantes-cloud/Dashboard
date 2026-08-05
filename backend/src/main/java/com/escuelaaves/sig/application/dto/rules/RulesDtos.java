package com.escuelaaves.sig.application.dto.rules;

import java.util.Map;

public final class RulesDtos {

    private RulesDtos() {
    }

    public record EvaluateRequest(
            String tourCode,
            Integer people,
            Boolean transport,
            Boolean restaurant,
            Boolean includesGuides,
            Integer guideCount,
            String pickup,
            Map<String, Object> extras
    ) {
    }

    public record EvaluateResponse(
            java.util.List<String> appliedRuleCodes,
            java.util.List<String> messages,
            Map<String, Object> flags,
            Map<String, Object> adjustments,
            boolean simulated
    ) {
    }
}
