package com.escuelaaves.sig.application.ai;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Mensajes para el asesor: sin secretos, SQL ni stack traces.
 * El detalle técnico se queda en logs.
 */
public final class AiUserSafeMessages {

    private static final Pattern SECRET = Pattern.compile(
            "(?i)(sk-ant-|AIza|Bearer\\s+[A-Za-z0-9_\\-.]{20,}|api[_-]?key\\s*[:=]\\s*\\S+)"
    );
    private static final Pattern TECHNICAL = Pattern.compile(
            "(?i)(exception|stacktrace|sql|jdbc|hibernate|psql|nullpointer|caused by:|"
                    + "at [a-z0-9_.]+\\.[A-Z]|org\\.postgresql|java\\.sql)"
    );

    private AiUserSafeMessages() {
    }

    public static String forUser(String raw) {
        if (raw == null || raw.isBlank()) {
            return "No pude completar esa operación.";
        }
        String t = SECRET.matcher(raw.trim()).replaceAll("[omitido]");
        if (TECHNICAL.matcher(t).find()) {
            return "No pude completar esa operación. Revisa los datos e inténtalo de nuevo.";
        }
        if (t.length() > 280) {
            return t.substring(0, 280) + "…";
        }
        return t;
    }

    /** Para logs y observabilidad: sin secretos ni tokens. Puede conservar detalle técnico. */
    public static String forLog(String raw) {
        if (raw == null || raw.isBlank()) {
            return raw;
        }
        String t = SECRET.matcher(raw).replaceAll("[omitido]");
        if (t.length() > 500) {
            return t.substring(0, 500) + "…";
        }
        return t;
    }

    public static boolean looksTechnical(String raw) {
        if (raw == null) {
            return false;
        }
        return TECHNICAL.matcher(raw.toLowerCase(Locale.ROOT)).find();
    }
}
