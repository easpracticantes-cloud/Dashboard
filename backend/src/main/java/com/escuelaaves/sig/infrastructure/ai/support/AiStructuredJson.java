package com.escuelaaves.sig.infrastructure.ai.support;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Utilidades compartidas para parsear respuestas JSON de LLMs.
 */
public final class AiStructuredJson {

    private AiStructuredJson() {
    }

    public static String extractJson(String raw) {
        if (raw == null) {
            return "{}";
        }
        String trimmed = raw.trim();
        if (trimmed.startsWith("```")) {
            int firstNl = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNl > 0 && lastFence > firstNl) {
                trimmed = trimmed.substring(firstNl + 1, lastFence).trim();
            }
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }

    public static String text(JsonNode node, String field) {
        String v = textOrNull(node, field);
        return v == null ? "" : v;
    }

    public static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        String s = v.asText("").trim();
        return s.isBlank() || "null".equalsIgnoreCase(s) ? null : s;
    }

    public static String upperOrNull(String value) {
        return value == null ? null : value.trim().toUpperCase();
    }

    public static Integer intOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        if (v.isNumber()) {
            return v.asInt();
        }
        try {
            return Integer.parseInt(v.asText().trim());
        } catch (Exception ex) {
            return null;
        }
    }

    public static Boolean boolOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        if (v.isBoolean()) {
            return v.asBoolean();
        }
        String t = v.asText("").trim().toLowerCase();
        if (t.isBlank()) {
            return null;
        }
        return t.equals("true") || t.equals("si") || t.equals("sí") || t.equals("1");
    }

    public static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() <= max ? value : value.substring(0, max) + "...";
    }
}
