package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Propiedades Anthropic (Claude). Secrets solo vía entorno / application.yml.
 */
@ConfigurationProperties(prefix = "app.ai.anthropic")
public record AnthropicProperties(
        String apiKey,
        /**
         * Requerido por Anthropic cuando la API key está ligada a una identidad
         * (header HTTP {@code anthropic-workspace-id}). Nunca hardcodear.
         */
        String workspaceId,
        String modelFast,
        String modelReasoning,
        String baseUrl,
        String apiVersion,
        int maxTokens,
        int maxRetries,
        int connectTimeoutSeconds,
        int readTimeoutSeconds,
        /** USD por millón de tokens de entrada (Haiku). */
        double priceFastInputPerMtok,
        double priceFastOutputPerMtok,
        double priceReasoningInputPerMtok,
        double priceReasoningOutputPerMtok
) {
    public AnthropicProperties {
        if (modelFast == null || modelFast.isBlank()) {
            modelFast = "claude-haiku-4-5-20251001";
        }
        if (modelReasoning == null || modelReasoning.isBlank()) {
            modelReasoning = "claude-sonnet-4-5-20250929";
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://api.anthropic.com";
        }
        if (apiVersion == null || apiVersion.isBlank()) {
            apiVersion = "2023-06-01";
        }
        if (maxTokens <= 0) {
            maxTokens = 4096;
        }
        if (maxRetries <= 0) {
            maxRetries = 2;
        }
        if (connectTimeoutSeconds <= 0) {
            connectTimeoutSeconds = 15;
        }
        if (readTimeoutSeconds <= 0) {
            readTimeoutSeconds = 90;
        }
        if (priceFastInputPerMtok <= 0) {
            priceFastInputPerMtok = 1.0;
        }
        if (priceFastOutputPerMtok <= 0) {
            priceFastOutputPerMtok = 5.0;
        }
        if (priceReasoningInputPerMtok <= 0) {
            priceReasoningInputPerMtok = 3.0;
        }
        if (priceReasoningOutputPerMtok <= 0) {
            priceReasoningOutputPerMtok = 15.0;
        }
        if (workspaceId != null) {
            workspaceId = workspaceId.trim();
            if (workspaceId.isEmpty()) {
                workspaceId = null;
            }
        }
    }

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }

    public boolean hasWorkspaceId() {
        return workspaceId != null && !workspaceId.isBlank();
    }

    public String modelFor(com.escuelaaves.sig.domain.ai.model.AiModelTier tier) {
        return tier == com.escuelaaves.sig.domain.ai.model.AiModelTier.REASONING
                ? modelReasoning
                : modelFast;
    }
}
