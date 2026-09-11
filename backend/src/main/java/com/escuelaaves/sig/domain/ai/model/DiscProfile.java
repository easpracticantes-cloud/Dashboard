package com.escuelaaves.sig.domain.ai.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Clasificación comercial del estilo de comunicación observado (no es un diagnóstico).
 * {@code disc} solo puede ser D, I, S, C o null (no determinado).
 */
public record DiscProfile(
        String disc,
        double confidence,
        String reason,
        List<String> signals
) {
    public static final double MIN_CONFIDENCE = 0.55;

    public DiscProfile {
        disc = normalize(disc);
        if (confidence < 0) {
            confidence = 0;
        }
        if (confidence > 1) {
            confidence = 1;
        }
        reason = reason == null ? "" : reason;
        signals = signals == null ? List.of() : List.copyOf(signals);
    }

    public static DiscProfile undetermined() {
        return new DiscProfile(null, 0, "No hay evidencia suficiente en el estilo de comunicación del prospecto.", List.of());
    }

    public static DiscProfile of(String disc, double confidence, String reason, List<String> signals) {
        String letter = normalize(disc);
        if (letter == null) {
            return undetermined();
        }
        return new DiscProfile(letter, confidence, reason, signals);
    }

    public boolean determined() {
        return disc != null && confidence >= MIN_CONFIDENCE;
    }

    public static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String t = raw.trim().toUpperCase(Locale.ROOT);
        if (t.startsWith("D ") || t.equals("DOMINANCIA") || t.equals("DOMINANCE")
                || t.equals("ROJO") || t.equals("RED") || t.equals("DOMINANTE")) {
            t = "D";
        } else if (t.startsWith("I ") || t.equals("INFLUENCIA") || t.equals("INFLUENCE")
                || t.equals("AMARILLO") || t.equals("YELLOW")) {
            t = "I";
        } else if (t.startsWith("S ") || t.equals("ESTABILIDAD") || t.equals("STEADINESS")
                || t.equals("VERDE") || t.equals("GREEN") || t.equals("ESTABLE")) {
            t = "S";
        } else if (t.startsWith("C ") || t.equals("CUMPLIMIENTO") || t.equals("CONCIENTIOUSNESS")
                || t.equals("CONSCIENTIOUSNESS") || t.equals("AZUL") || t.equals("BLUE")) {
            t = "C";
        }
        return switch (t) {
            case "D", "I", "S", "C" -> t;
            default -> null;
        };
    }

    /**
     * Claude si trae letra válida; si no, el clasificador local de patrones.
     * Si ambos coinciden, se refuerza la confianza. Empate cercano baja la confianza.
     */
    public static DiscProfile mergePreferringModel(DiscProfile model, DiscProfile local) {
        DiscProfile m = model == null ? undetermined() : model;
        DiscProfile l = local == null ? undetermined() : local;
        boolean mOk = m.disc() != null;
        boolean lOk = l.disc() != null;
        if (mOk && lOk && m.disc().equals(l.disc())) {
            double conf = Math.min(1.0, Math.max(m.confidence(), l.confidence()) + 0.05);
            return new DiscProfile(m.disc(), conf, firstReason(m, l), unionSignals(m, l));
        }
        if (mOk && lOk && !m.disc().equals(l.disc())) {
            DiscProfile top = m.confidence() >= l.confidence() ? m : l;
            double gap = Math.abs(m.confidence() - l.confidence());
            double conf = gap < 0.12 ? Math.min(top.confidence(), 0.62) : top.confidence() * 0.85;
            return new DiscProfile(top.disc(), conf, top.reason(), unionSignals(m, l));
        }
        if (mOk) {
            return m;
        }
        if (lOk) {
            return l;
        }
        return undetermined();
    }

    private static String firstReason(DiscProfile a, DiscProfile b) {
        if (a.reason() != null && !a.reason().isBlank()) {
            return a.reason();
        }
        return b.reason();
    }

    private static List<String> unionSignals(DiscProfile a, DiscProfile b) {
        List<String> out = new ArrayList<>();
        for (String s : a.signals()) {
            if (!out.contains(s)) {
                out.add(s);
            }
        }
        for (String s : b.signals()) {
            if (!out.contains(s)) {
                out.add(s);
            }
        }
        return out.size() > 8 ? out.subList(0, 8) : out;
    }
}
