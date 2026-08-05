package com.escuelaaves.sig.domain.rules.model;

import java.util.List;

public record BusinessRule(
        Long id,
        String code,
        String name,
        int priority,
        boolean active,
        String tourCode,
        List<RuleCondition> conditions,
        List<RuleAction> actions
) {
}
