package com.escuelaaves.sig.application.ai;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Detecta pedido de cotización/PDF y negativas del modelo que no deben
 * bloquear el panel comercial.
 */
public final class AveQuoteIntent {

    private static final Pattern REQUEST = Pattern.compile(
            "(cotiz|presupuesto|tarifa|"
                    + "cu[aá]nto\\s+(cuesta|vale|sale)|"
                    + "genera(?:r)?\\s+(el\\s+)?(pdf|excel|documento)|"
                    + "descarga(?:r)?\\s+(el\\s+)?(pdf|excel)|"
                    + "plantilla|"
                    + "pdf\\s+de\\s+la\\s+cotiz|"
                    + "excel\\s+de\\s+la\\s+cotiz)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Pattern REFUSAL = Pattern.compile(
            "(no (puedo|tengo) (generar|emitir|acceso)|"
                    + "no represento|"
                    + "no puedo procesar datos personales|"
                    + "documentos? (oficiales|vinculantes)|"
                    + "autoridad para emitir|"
                    + "contacta directamente)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private AveQuoteIntent() {
    }

    public static boolean isQuoteRequest(String message) {
        return message != null && !message.isBlank() && REQUEST.matcher(message).find();
    }

    public static boolean looksLikeQuoteRefusal(String reply) {
        if (reply == null || reply.isBlank()) {
            return false;
        }
        String text = reply.toLowerCase(Locale.ROOT);
        return REFUSAL.matcher(text).find()
                && (text.contains("cotiz") || text.contains("pdf") || text.contains("precio")
                || text.contains("rafting") || text.contains("agencia"));
    }
}
