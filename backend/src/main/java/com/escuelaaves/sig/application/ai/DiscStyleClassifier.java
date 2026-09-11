package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.DiscProfile;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Infere D/I/S/C solo del estilo de comunicación observable del prospecto
 * (ritmo rápido/pausado × orientación tareas/personas). No diagnostica personalidad.
 */
public final class DiscStyleClassifier {

    private static final Pattern EMOJI = Pattern.compile(
            "[\\x{1F300}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{FE0F}\\x{1F1E6}-\\x{1F1FF}]"
    );
    private static final Pattern URGENCY = Pattern.compile(
            "\\b(ya|ahora|urgente|mañana|hoy|rápido|rapido|inmediato|env[ií]ame ya|propuesta ya)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern IMPERATIVE = Pattern.compile(
            "\\b(conf[ií]rmame|confirmame|env[ií]ame|dame|m[aá]ndame|hazlo|cierra|reserva)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern RESULT = Pattern.compile(
            "\\b(precio|cupo|horario|disponib|resultado|propuesta|cu[aá]nto|vale)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern SOCIAL = Pattern.compile(
            "\\b(amigos?|familia|grupo|fotos?|experiencia|encanta|emocion|emoción|incre[ií]ble|genial)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern SAFETY = Pattern.compile(
            "\\b(seguridad|acompa[ñn]|tranquilo|pesado|preocupa|confianza|calma)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern CAUTION = Pattern.compile(
            "\\b(con calma|lo voy a revisar|me gustar[ií]a|quisiera|prefiero|pensarlo)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern COURTESY = Pattern.compile(
            "\\b(buenos d[ií]as|buenas tardes|buenas noches|muchas gracias|por favor|gracias)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern PRECISION = Pattern.compile(
            "\\b(ficha t[eé]cnica|pdf|desglose|estad[ií]stic|evidencia|exacta|exactamente|incluye|condiciones|cancelaci[oó]n|pol[ií]tica|especific|comparar|analizar)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern FORMAL = Pattern.compile(
            "\\b(env[ií]eme|necesito|podr[ií]a enviarme|me puede enviar)\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private DiscStyleClassifier() {
    }

    public static DiscProfile classifyProspectText(String blob) {
        if (blob == null || blob.isBlank()) {
            return DiscProfile.undetermined();
        }
        List<String> parts = new ArrayList<>();
        for (String line : blob.split("\\R")) {
            if (!line.isBlank()) {
                parts.add(line.trim());
            }
        }
        return classify(parts);
    }

    public static DiscProfile classify(List<String> prospectMessages) {
        if (prospectMessages == null || prospectMessages.isEmpty()) {
            return DiscProfile.undetermined();
        }
        List<String> msgs = prospectMessages.stream()
                .filter(m -> m != null && !m.isBlank())
                .map(String::trim)
                .toList();
        if (msgs.isEmpty()) {
            return DiscProfile.undetermined();
        }
        String joined = String.join("\n", msgs).toLowerCase(Locale.ROOT);
        int chars = joined.replaceAll("\\s+", "").length();
        if (msgs.size() == 1 && chars < 12) {
            return DiscProfile.undetermined();
        }

        int fast = 0;
        int slow = 0;
        int task = 0;
        int people = 0;
        List<String> signals = new ArrayList<>();

        double avgLen = msgs.stream().mapToInt(String::length).average().orElse(0);
        long exclam = joined.chars().filter(c -> c == '!').count();
        boolean emoji = EMOJI.matcher(String.join("\n", msgs)).find();

        if (avgLen > 0 && avgLen <= 42) {
            fast += 2;
            signals.add("mensajes directos");
        }
        if (URGENCY.matcher(joined).find()) {
            fast += 3;
            signals.add("urgencia");
        }
        if (IMPERATIVE.matcher(joined).find()) {
            fast += 2;
            signals.add("imperativos");
        }
        if (RESULT.matcher(joined).find()) {
            task += 3;
            fast += 1;
            signals.add("orientación a resultados");
        }
        if (PRECISION.matcher(joined).find()) {
            task += 5;
            slow += 2;
            signals.add("solicitud de datos");
            signals.add("precisión");
        }
        if (FORMAL.matcher(joined).find()) {
            slow += 2;
            task += 1;
            signals.add("lenguaje formal");
        }
        if (COURTESY.matcher(joined).find()) {
            slow += 2;
            people += 1;
            signals.add("cortesía");
        }
        if (CAUTION.matcher(joined).find()) {
            slow += 4;
            people += 2;
            signals.add("cautela");
            signals.add("ritmo pausado");
        }
        if (SAFETY.matcher(joined).find()) {
            people += 3;
            slow += 2;
            signals.add("seguridad");
            signals.add("acompañamiento");
        }
        if (SOCIAL.matcher(joined).find()) {
            people += 3;
            fast += 1;
            signals.add("orientación social");
        }
        if (emoji) {
            people += 2;
            signals.add("emojis");
        }
        if (exclam >= 2) {
            people += 2;
            fast += 1;
            signals.add("exclamaciones");
            signals.add("entusiasmo");
        }
        if (joined.contains("detalle") || joined.contains("document")) {
            task += 2;
            signals.add("documentación");
        }

        if (fast + slow + task + people == 0 || (chars < 18 && msgs.size() < 2)) {
            return DiscProfile.undetermined();
        }

        double d = fast + task;
        double i = fast + people;
        double s = slow + people;
        double c = slow + task;
        double max = Math.max(Math.max(d, i), Math.max(s, c));
        if (max < 3) {
            return DiscProfile.undetermined();
        }
        String letter;
        String reason;
        if (c >= max && c >= d && c >= i && c >= s) {
            letter = "C";
            reason = "Busca información precisa, estructurada y verificable.";
        } else if (d >= max && d >= i && d >= s) {
            letter = "D";
            reason = "Comunicación directa, orientada a precio, disponibilidad y cierre rápido.";
        } else if (i >= max && i >= s) {
            letter = "I";
            reason = "Comunicación expresiva, social y entusiasta.";
        } else {
            letter = "S";
            reason = "Busca seguridad, acompañamiento y tomar la decisión con calma.";
        }
        // Si C y D empatan cerca, C gana cuando hay precisión (ficha/PDF/condiciones).
        if (PRECISION.matcher(joined).find() && c >= d - 1) {
            letter = "C";
            reason = "Busca información precisa, estructurada y verificable.";
        }
        double second = secondBest(d, i, s, c, letter);
        double conf = Math.min(0.95, 0.52 + max * 0.05);
        if (max - second < 1.5) {
            conf = Math.min(conf, 0.64);
        }
        List<String> slim = signals.stream().distinct().limit(6).toList();
        return DiscProfile.of(letter, conf, reason, slim);
    }

    private static double secondBest(double d, double i, double s, double c, String winner) {
        return switch (winner) {
            case "D" -> Math.max(i, Math.max(s, c));
            case "I" -> Math.max(d, Math.max(s, c));
            case "S" -> Math.max(d, Math.max(i, c));
            default -> Math.max(d, Math.max(i, s));
        };
    }
}
