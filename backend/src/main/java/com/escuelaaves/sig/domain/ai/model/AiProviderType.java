package com.escuelaaves.sig.domain.ai.model;

/**
 * Proveedor de IA activo (Strategy + Factory).
 */
public enum AiProviderType {
    GEMINI,
    OPENAI,
    CLAUDE,
    DEEPSEEK;

    public static AiProviderType from(String raw) {
        if (raw == null || raw.isBlank()) {
            return GEMINI;
        }
        return switch (raw.trim().toLowerCase()) {
            case "openai" -> OPENAI;
            case "claude", "anthropic" -> CLAUDE;
            case "deepseek" -> DEEPSEEK;
            default -> GEMINI;
        };
    }

    public String id() {
        return name().toLowerCase();
    }
}
