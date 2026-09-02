package com.escuelaaves.sig.domain.ai.model;

/**
 * Resultado de complejidad para routing Haiku vs Sonnet.
 */
public record ComplexityScore(
        int score,
        AiModelTier recommendedTier,
        String rationale
) {
    public static ComplexityScore of(int score, String rationale) {
        AiModelTier tier = score >= 60 ? AiModelTier.REASONING : AiModelTier.FAST;
        return new ComplexityScore(score, tier, rationale != null ? rationale : "");
    }
}
