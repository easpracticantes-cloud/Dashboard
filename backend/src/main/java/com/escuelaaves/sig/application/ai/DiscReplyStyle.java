package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.DiscProfile;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Adapta el tono comercial de Ave / WhatsApp al DISC observado. No cambia la identidad general.
 */
public final class DiscReplyStyle {

    private DiscReplyStyle() {
    }

    public static String fromUiContext(String uiContext, ObjectMapper mapper) {
        if (uiContext == null || uiContext.isBlank() || mapper == null) {
            return null;
        }
        try {
            JsonNode root = mapper.readTree(uiContext);
            String disc = DiscProfile.normalize(root.path("allowedContext").path("disc").asText(null));
            if (disc == null) {
                disc = DiscProfile.normalize(root.path("disc").asText(null));
            }
            return disc;
        } catch (Exception ex) {
            return null;
        }
    }

    public static String systemAppendix(String disc) {
        String letter = DiscProfile.normalize(disc);
        if (letter == null) {
            return "";
        }
        String tone = switch (letter) {
            case "D" -> """
                    Estilo comercial para este prospecto (comunicación tipo D): breve, directo.
                    Prioriza precio, disponibilidad, horarios y cierre. Sin rodeos ni presión teatral.
                    """;
            case "I" -> """
                    Estilo comercial para este prospecto (comunicación tipo I): cálido, entusiasta, social.
                    Habla de la experiencia y la conexión. Emojis con moderación.
                    """;
            case "S" -> """
                    Estilo comercial para este prospecto (comunicación tipo S): tranquilo, paciente, seguro.
                    Sin presión. Ofrece acompañamiento y tiempo para decidir.
                    """;
            case "C" -> """
                    Estilo comercial para este prospecto (comunicación tipo C): datos, especificaciones,
                    precios desglosados, condiciones y documentos verificables. Exacto, sin adornos.
                    """;
            default -> "";
        };
        if (tone.isBlank()) {
            return "";
        }
        return "\n## Tono según estilo de comunicación observado (DISC " + letter + ")\n"
                + "No afirmes rasgos de personalidad. Solo adapta el tono de esta respuesta.\n"
                + tone;
    }
}
