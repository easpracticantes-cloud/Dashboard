package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.AiModelTier;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.infrastructure.ai.config.AnthropicProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Estimación de costo y registro de uso LLM (fase A1).
 * Tarifas configurables en app.ai.anthropic.*.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiUsageService {

    private final AiObservabilityPort observabilityPort;
    private final AnthropicProperties anthropicProperties;

    public double estimateAnthropicCostUsd(AiModelTier tier, int inputTokens, int outputTokens) {
        double inRate;
        double outRate;
        if (tier == AiModelTier.REASONING) {
            inRate = anthropicProperties.priceReasoningInputPerMtok();
            outRate = anthropicProperties.priceReasoningOutputPerMtok();
        } else {
            inRate = anthropicProperties.priceFastInputPerMtok();
            outRate = anthropicProperties.priceFastOutputPerMtok();
        }
        return (inputTokens / 1_000_000.0) * inRate + (outputTokens / 1_000_000.0) * outRate;
    }

    public void recordLlmCall(
            String operation,
            String endpoint,
            String provider,
            String model,
            AiModelTier tier,
            long latencyMs,
            Integer inputTokens,
            Integer outputTokens,
            boolean success,
            String errorMessage
    ) {
        int in = inputTokens != null ? Math.max(0, inputTokens) : 0;
        int out = outputTokens != null ? Math.max(0, outputTokens) : 0;
        int total = in + out;
        Double cost = null;
        if ("claude".equalsIgnoreCase(provider) || "anthropic".equalsIgnoreCase(provider)) {
            cost = estimateAnthropicCostUsd(tier != null ? tier : AiModelTier.FAST, in, out);
        } else if (total > 0) {
            cost = estimateAnthropicCostUsd(tier != null ? tier : AiModelTier.FAST, in, out);
        }

        observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                null,
                endpoint,
                operation,
                provider,
                model,
                latencyMs,
                total > 0 ? total : null,
                success,
                errorMessage,
                inputTokens,
                outputTokens,
                cost,
                tier != null ? tier.name() : null
        ));
        if (cost != null) {
            log.info("[AI-Usage] op={} provider={} model={} tier={} in={} out={} costUsd≈{}",
                    operation, provider, model, tier, in, out, String.format("%.6f", cost));
        }
    }

    /** Estimación tosca de tokens cuando el proveedor no reporta usage. */
    public static int estimateTokensFromChars(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return Math.max(1, text.length() / 4);
    }
}
