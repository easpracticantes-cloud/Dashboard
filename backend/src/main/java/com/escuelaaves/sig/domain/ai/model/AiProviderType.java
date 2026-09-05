package com.escuelaaves.sig.domain.ai.model;

/**
 * Proveedor de IA activo. El único motor soportado es Claude (Anthropic).
 */
public enum AiProviderType {
    CLAUDE,
    OPENAI,
    DEEPSEEK;

    public static AiProviderType from(String raw) {
        if (raw == null || raw.isBlank()) {
            return CLAUDE;
        }
        return switch (raw.trim().toLowerCase()) {
            case "openai" -> OPENAI;
            case "deepseek" -> DEEPSEEK;
            default -> CLAUDE;
        };
    }

    public String id() {
        return name().toLowerCase();
    }
}
