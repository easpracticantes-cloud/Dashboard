package com.escuelaaves.sig.domain.ai.port.out;

public interface AiObservabilityPort {

    void record(AiUsageEvent event);

    record AiUsageEvent(
            Long userId,
            String endpoint,
            String operation,
            String provider,
            String model,
            Long latencyMs,
            Integer estimatedTokens,
            boolean success,
            String errorMessage,
            Integer inputTokens,
            Integer outputTokens,
            Double estimatedCostUsd,
            String modelTier
    ) {
        /** Compatibilidad con callers de alto nivel (sin desglose de costo). */
        public AiUsageEvent(
                Long userId,
                String endpoint,
                String operation,
                String provider,
                String model,
                Long latencyMs,
                Integer estimatedTokens,
                boolean success,
                String errorMessage
        ) {
            this(userId, endpoint, operation, provider, model, latencyMs, estimatedTokens,
                    success, errorMessage, null, null, null, null);
        }
    }
}
