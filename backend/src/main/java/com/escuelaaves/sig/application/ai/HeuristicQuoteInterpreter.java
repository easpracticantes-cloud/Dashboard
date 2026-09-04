package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Interpreta cotizaciones en español con reglas locales (sin LLM).
 * No inventa tour ni personas: si no hay señal clara, deja null
 * (el PricingEngine / CatalogQuoteService aplican defaults solo al cotizar).
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

        String tour = detectTour(norm);

        Integer people = null;
        Matcher m = PEOPLE.matcher(text);
        if (m.find()) {
            String g1 = m.group(1);
            String g2 = m.group(2);
            people = Integer.parseInt(g1 != null ? g1 : g2);
            if (people < 1) {
                people = null;
            }
        }

        Boolean transport = null;
        boolean hasTransport = containsAny(norm,
                "transporte", "jeep", "recogida", "pickup", "traslado", "con transport");
        boolean noTransport = containsAny(norm, "sin transporte", "no transporte", "sin jeep");
        if (noTransport) {
            transport = false;
        } else if (hasTransport) {
            transport = true;
        }

        Boolean restaurant = null;
        boolean hasRestaurant = containsAny(norm,
                "almuerzo", "comida", "restaurante", "lunch", "con rest");
        boolean noRestaurant = containsAny(norm, "sin almuerzo", "sin comida", "sin restaurante");
        if (noRestaurant) {
            restaurant = false;
        } else if (hasRestaurant) {
            restaurant = true;
        }

        String modalityNote = containsAny(norm, "compartido", "civitatis", "grupo")
                ? "COMPARTIDO"
                : (containsAny(norm, "privado", "private") ? "PRIVADO" : null);

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

        String notes = "interpretación local";
        if (modalityNote != null) {
            notes = notes + " | " + modalityNote;
        }

        return new QuoteInterpretation(
                tour,
                people,
                null,
                pickup,
                transport,
                restaurant,
                notes
        );
    }

    private static String detectTour(String norm) {
        if (norm.contains("rafting")) {
            return "RAFTING_EN_EL_EJE_CAFETERO";
        }
        if (norm.contains("cabalgata")) {
            return "CABALGATA_ECOLOGICA";
        }
        if (norm.contains("canopy")) {
            return "CANOPY_EXTREMO_EN_EL_QUINDIO";
        }
        if (norm.contains("parapente")) {
            return "PARAPENTE";
        }
        if (norm.contains("paramotor")) {
            return "PARAMOTOR";
        }
        if (norm.contains("globo")) {
            return "GLOBO_AEROSTATICO";
        }
        if (norm.contains("santuario") || norm.contains("palma de cera")) {
            return "SANTUARIO_DE_LA_PALMA_DE_CERA";
        }
        if (norm.contains("bicirriel")) {
            return "BICIRRIEL_EN_EL_QUINDIO";
        }
        if (norm.contains("filandia")) {
            return "FILANDIA";
        }
        if (norm.contains("termales") || norm.contains("termal")) {
            return "TERMALES";
        }
        if (norm.contains("cafe") || norm.contains("café") || norm.contains("cafeter")) {
            return "CAFE";
        }
        if (norm.contains("cocora") || norm.contains("cócora")) {
            return "COCORA";
        }
        if (norm.contains("acaime")) {
            return "ACAIME";
        }
        return null;
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
