package com.escuelaaves.sig.infrastructure.ai.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Cuerpo de request hacia la API generateContent de Gemini.
 * Solo se usa dentro del adapter de infraestructura.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeminiRequest(
        List<Content> contents,
        SystemInstruction systemInstruction,
        GenerationConfig generationConfig
) {

    public record Content(String role, List<Part> parts) {
    }

    public record Part(String text) {
    }

    public record SystemInstruction(List<Part> parts) {
    }

    public record GenerationConfig(
            Double temperature,
            Integer maxOutputTokens,
            String responseMimeType
    ) {
    }

    public static GeminiRequest textPrompt(String systemPrompt, String userMessage, boolean jsonMode) {
        SystemInstruction system = (systemPrompt == null || systemPrompt.isBlank())
                ? null
                : new SystemInstruction(List.of(new Part(systemPrompt)));
        Content user = new Content("user", List.of(new Part(userMessage)));
        GenerationConfig config = new GenerationConfig(
                0.2,
                2048,
                jsonMode ? "application/json" : "text/plain"
        );
        return new GeminiRequest(List.of(user), system, config);
    }
}
