package com.escuelaaves.sig.infrastructure.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Respuesta cruda de Gemini generateContent.
 * Se mapea a modelos de dominio dentro del adapter.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record GeminiResponse(
        List<Candidate> candidates,
        PromptFeedback promptFeedback,
        String error
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Candidate(Content content, String finishReason) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Content(List<Part> parts, String role) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Part(String text) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PromptFeedback(String blockReason) {
    }

    /** Extrae el primer texto útil de la respuesta. */
    public String firstText() {
        if (candidates == null || candidates.isEmpty()) {
            return "";
        }
        Candidate first = candidates.getFirst();
        if (first == null || first.content() == null || first.content().parts() == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Part part : first.content().parts()) {
            if (part != null && part.text() != null) {
                sb.append(part.text());
            }
        }
        return sb.toString().trim();
    }
}
