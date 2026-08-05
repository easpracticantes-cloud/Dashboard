package com.escuelaaves.sig.domain.rules.model;

public record RuleCondition(
        String field,
        String operator,
        String valueJson
) {
}
