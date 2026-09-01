package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Propiedades de integración Gemini.
 * La API key se inyecta solo vía entorno / application.yml (nunca hardcodeada).
 */
@ConfigurationProperties(prefix = "app.ai.gemini")
public record GeminiProperties(
        String apiKey,
        String model,
        String baseUrl,
        /** Modelos alternos separados por coma si el principal falla (404/403). */
        String fallbackModels,
        int connectTimeoutSeconds,
        int readTimeoutSeconds
) {
    public GeminiProperties {
        if (model == null || model.isBlank()) {
            model = "gemini-2.0-flash";
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        }
        if (fallbackModels == null) {
            fallbackModels = "gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-flash-latest,gemini-flash-latest";
        }
        if (connectTimeoutSeconds <= 0) {
            connectTimeoutSeconds = 15;
        }
        if (readTimeoutSeconds <= 0) {
            readTimeoutSeconds = 90;
        }
    }

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Modelo principal + fallbacks sin duplicados. */
    public List<String> modelsToTry() {
        Set<String> ordered = new LinkedHashSet<>();
        if (model != null && !model.isBlank()) {
            ordered.add(model.trim());
        }
        if (fallbackModels != null) {
            for (String part : fallbackModels.split(",")) {
                String m = part.trim();
                if (!m.isEmpty()) {
                    ordered.add(m);
                }
            }
        }
        return new ArrayList<>(ordered);
    }
}
