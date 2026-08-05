package com.escuelaaves.sig.domain.ai.model;

/**
 * Detección de idioma del texto.
 */
public record LanguageDetection(
        String languageCode,
        String languageName,
        double confidence
) {
}
