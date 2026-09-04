package com.escuelaaves.sig.application.ai;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Decide si este turno necesita contexto/herramientas del SIG.
 * Nunca se usa para rechazar una pregunta: Claude siempre responde.
 */
public final class SigTopicDetector {

    private static final Pattern BUSINESS = Pattern.compile(
            "(cotiz|tarifa|precio\\s+(del|de\\s+l[ao]|por)|presupuesto|"
                    + "proveedor(?:es)?|pax\\b|"
                    + "\\b(?:tour|tours|jeep|reserva(?:r|s)?|reservacion|"
                    + "crm|inbox|cat[aá]logo|checklist)\\b|"
                    + "escuela\\s+aves|\\bsig\\b|"
                    + "acaime|cocora|rafting|parapente|paramotor|canopy|"
                    + "cabalgata|filandia|termales|bicirriel|palma\\s+de\\s+cera|"
                    + "trekking|trek\\b)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Pattern SYSTEM_HELP = Pattern.compile(
            "(qu[eé]\\s+puedes\\s+hacer|capacidades\\s+del\\s+sistema|"
                    + "dentro\\s+del\\s+sistema|en\\s+este\\s+sistema|en\\s+el\\s+sig)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private SigTopicDetector() {
    }

    public static boolean needsBusinessContext(String message) {
        if (message == null || message.isBlank()) {
            return false;
        }
        String text = message.trim();
        if (SYSTEM_HELP.matcher(text).find()) {
            return true;
        }
        if (BUSINESS.matcher(text).find()) {
            return true;
        }
        var hint = HeuristicQuoteInterpreter.interpret(text);
        return hint.tour() != null && !hint.tour().isBlank();
    }
}
