package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Propiedades de integración Gemini (default: gemini-3.6-flash).
 * La API key se inyecta solo vía entorno / application.yml (nunca hardcodeada).
 */
@ConfigurationProperties(prefix = "app.ai.gemini")
public record GeminiProperties(
        String apiKey,
        String model,
        String baseUrl,
        int connectTimeoutSeconds,
        int readTimeoutSeconds
) {
    public GeminiProperties {
        if (model == null || model.isBlank()) {
            model = "gemini-3.6-flash";
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        }
        if (connectTimeoutSeconds <= 0) {
            connectTimeoutSeconds = 15;
        }
        if (readTimeoutSeconds <= 0) {
            readTimeoutSeconds = 60;
        }
    }

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
