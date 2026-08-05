package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Interpreta cotizaciones en español con reglas locales (sin llamar a Gemini).
 */
public final class HeuristicQuoteInterpreter {

    private static final Pattern PEOPLE = Pattern.compile(
            "(\\d{1,3})\\s*(?:personas?|pax|gente|adultos?)|(?:somos|para|seremos)\\s*(\\d{1,3})",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private HeuristicQuoteInterpreter() {
    }

    public static QuoteInterpretation interpret(String message) {
        String text = message != null ? message : "";
        String norm = normalize(text);

        String tour = "ACAIME";
        if (norm.contains("filandia")) {
            tour = "FILANDIA";
        } else if (norm.contains("termales") || norm.contains("termal")) {
            tour = "TERMALES";
        } else if (norm.contains("cafe") || norm.contains("café") || norm.contains("cafeter")) {
            tour = "CAFE";
        } else if (norm.contains("cocora") || norm.contains("cócora")) {
            tour = "COCORA";
        } else if (norm.contains("acaime")) {
            tour = "ACAIME";
        }

        Integer people = null;
        Matcher m = PEOPLE.matcher(text);
        if (m.find()) {
            String g1 = m.group(1);
            String g2 = m.group(2);
            people = Integer.parseInt(g1 != null ? g1 : g2);
        }
        if (people == null || people < 1) {
            people = 2;
        }

        boolean transport = containsAny(norm,
                "transporte", "jeep", "recogida", "pickup", "traslado", "con transport");
        boolean noTransport = containsAny(norm, "sin transporte", "no transporte", "sin jeep");
        if (noTransport) {
            transport = false;
        } else if (!transport && people > 4) {
            transport = true;
        }

        boolean restaurant = containsAny(norm,
                "almuerzo", "comida", "restaurante", "lunch", "con rest");
        boolean noRestaurant = containsAny(norm, "sin almuerzo", "sin comida", "sin restaurante");
        if (noRestaurant) {
            restaurant = false;
        }

        String pickup = null;
        if (norm.contains("armenia")) {
            pickup = "Armenia";
        } else if (norm.contains("pereira")) {
            pickup = "Pereira";
        } else if (norm.contains("salento")) {
            pickup = "Salento";
        } else if (norm.contains("calarca") || norm.contains("calarcá")) {
            pickup = "Calarcá";
        }

        return new QuoteInterpretation(
                tour,
                people,
                null,
                pickup,
                transport,
                restaurant,
                "interpretación local (sin Gemini)"
        );
    }

    private static boolean containsAny(String haystack, String... needles) {
        for (String n : needles) {
            if (haystack.contains(normalize(n))) {
                return true;
            }
        }
        return false;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT)
                .replace('á', 'a').replace('é', 'e').replace('í', 'i')
                .replace('ó', 'o').replace('ú', 'u').replace('ü', 'u');
    }
}
