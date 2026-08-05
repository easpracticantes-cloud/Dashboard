package com.escuelaaves.sig.domain.rules.model;

public record RuleAction(
        String actionType,
        String payloadJson
) {
}
