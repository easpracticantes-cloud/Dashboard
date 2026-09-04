package com.escuelaaves.sig.application.ai;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Evita que respuestas viejas con identidad comercial se lean como instrucciones.
 */
public final class AveHistorySanitizer {

    private static final Pattern STALE_PERSONA = Pattern.compile(
            "(fuera de (mi |tu )?cancha|"
                    + "no son mi cancha|"
                    + "un poco fuera de mi cancha|"
                    + "solo (puedo|manejo|manejas)( ayudarte)?|"
                    + "ando metida|"
                    + "enfocada en tours|"
                    + "temas t[eé]cnicos.{0,40}no son|"
                    + "asistente (conversacional )?de escuela|"
                    + "asistente de .{0,40}salento|"
                    + "escuela aves salento|"
                    + "aves salento|"
                    + "info de tours|"
                    + "trekking,? jeep|"
                    + "preg[uú]ntale a (chatgpt|google)|"
                    + "algo del negocio en lo que pueda)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    public static final String OMITTED =
            "[respuesta previa omitida: no define tu rol ni tu empleador]";

    private AveHistorySanitizer() {
    }

    public static String sanitizeTurn(String role, String content) {
        if (content == null) {
            return "";
        }
        if (role != null && "assistant".equalsIgnoreCase(role.trim()) && looksLikeStalePersona(content)) {
            return OMITTED;
        }
        return content;
    }

    public static boolean looksLikeStalePersona(String content) {
        if (content == null || content.isBlank()) {
            return false;
        }
        return STALE_PERSONA.matcher(content).find()
                || (content.toLowerCase(Locale.ROOT).contains("escuela aves")
                && (content.toLowerCase(Locale.ROOT).contains("tour")
                || content.toLowerCase(Locale.ROOT).contains("reserva")
                || content.toLowerCase(Locale.ROOT).contains("cancha")));
    }
}
