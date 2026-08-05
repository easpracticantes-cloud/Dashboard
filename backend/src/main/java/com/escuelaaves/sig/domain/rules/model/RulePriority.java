package com.escuelaaves.sig.domain.rules.model;

public enum RulePriority {
    LOW(10),
    NORMAL(50),
    HIGH(80),
    CRITICAL(100);

    private final int weight;

    RulePriority(int weight) {
        this.weight = weight;
    }

    public int weight() {
        return weight;
    }

    public static RulePriority fromWeight(int weight) {
        if (weight >= 100) {
            return CRITICAL;
        }
        if (weight >= 80) {
            return HIGH;
        }
        if (weight >= 50) {
            return NORMAL;
        }
        return LOW;
    }
}
