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
            String errorMessage
    ) {
    }
}
