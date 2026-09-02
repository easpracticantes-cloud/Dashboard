package com.escuelaaves.sig.infrastructure.ai.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Valida JSON estructurado de LLM; permite un retry hint.
 */
public final class StructuredOutputValidator {

    private StructuredOutputValidator() {
    }

    public record ValidationResult(boolean valid, JsonNode node, String error, String retryHint) {
        public static ValidationResult ok(JsonNode node) {
            return new ValidationResult(true, node, null, null);
        }

        public static ValidationResult fail(String error) {
            return new ValidationResult(false, null, error,
                    "Responde de nuevo SOLO con JSON válido. Sin markdown ni texto fuera del JSON.");
        }
    }

    public static ValidationResult parseObject(ObjectMapper mapper, String raw, String... requiredFields) {
        try {
            String json = AiStructuredJson.extractJson(raw);
            JsonNode node = mapper.readTree(json);
            if (node == null || !node.isObject()) {
                return ValidationResult.fail("La respuesta no es un objeto JSON");
            }
            if (requiredFields != null) {
                for (String field : requiredFields) {
                    if (!node.has(field)) {
                        return ValidationResult.fail("Falta campo requerido: " + field);
                    }
                }
            }
            return ValidationResult.ok(node);
        } catch (Exception ex) {
            return ValidationResult.fail("JSON inválido: " + ex.getMessage());
        }
    }
}
