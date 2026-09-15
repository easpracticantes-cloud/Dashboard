package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Interpreta cotizaciones en español con reglas locales (sin LLM).
 * Extrae tour, personas, fecha, pickup y modalidad; los precios los pone el catálogo.
 */
public final class HeuristicQuoteInterpreter {

    private static final Pattern PEOPLE = Pattern.compile(
            "(\\d{1,3})\\s*(?:personas?|pax|gente|adultos?)|(?:somos|para|seremos)\\s*(\\d{1,3})",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Pattern ISO_DATE = Pattern.compile("\\b(20\\d{2}-\\d{2}-\\d{2})\\b");
    private static final Pattern DMY = Pattern.compile("\\b(\\d{1,2})[/-](\\d{1,2})(?:[/-](20\\d{2}|\\d{2}))?\\b");
    private static final Pattern SPOKEN = Pattern.compile(
            "\\b(?:el\\s+)?(\\d{1,2})\\s+de\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\\s+de\\s+(20\\d{2}))?\\b",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Map<String, Integer> MONTHS = Map.ofEntries(
            Map.entry("enero", 1), Map.entry("febrero", 2), Map.entry("marzo", 3),
            Map.entry("abril", 4), Map.entry("mayo", 5), Map.entry("junio", 6),
            Map.entry("julio", 7), Map.entry("agosto", 8), Map.entry("septiembre", 9),
            Map.entry("setiembre", 9), Map.entry("octubre", 10), Map.entry("noviembre", 11),
            Map.entry("diciembre", 12)
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

        String modalityNote = containsAny(norm, "compartido", "civitatis", "grupo", "publico", "público")
                ? "COMPARTIDO"
                : (containsAny(norm, "privado", "private", "exclusivo") ? "PRIVADO" : null);

        String pickup = detectPickup(norm);
        String date = detectDate(text, norm);

        String notes = "interpretación local";
        if (modalityNote != null) {
            notes = notes + " | " + modalityNote;
        }
        if (date != null) {
            notes = notes + " | fecha " + date;
        }

        return new QuoteInterpretation(
                tour,
                people,
                date,
                pickup,
                transport,
                restaurant,
                notes
        );
    }

    private static String detectPickup(String norm) {
        if (norm.contains("armenia")) {
            return "Armenia";
        }
        if (norm.contains("pereira")) {
            return "Pereira";
        }
        if (norm.contains("salento")) {
            return "Salento";
        }
        if (norm.contains("calarca") || norm.contains("calarcá")) {
            return "Calarcá";
        }
        if (norm.contains("filandia")) {
            return "Filandia";
        }
        if (norm.contains("montenegro")) {
            return "Montenegro";
        }
        if (norm.contains("circasia")) {
            return "Circasia";
        }
        if (norm.contains("tebaida")) {
            return "La Tebaida";
        }
        return null;
    }

    private static String detectDate(String text, String norm) {
        LocalDate today = LocalDate.now();
        if (norm.contains("pasado manana") || norm.contains("pasado mañana")) {
            return today.plusDays(2).toString();
        }
        if (norm.matches(".*\\bmanana\\b.*") || norm.contains("mañana")) {
            return today.plusDays(1).toString();
        }
        if (norm.matches(".*\\bhoy\\b.*")) {
            return today.toString();
        }

        Matcher iso = ISO_DATE.matcher(text);
        if (iso.find()) {
            return iso.group(1);
        }

        Matcher spoken = SPOKEN.matcher(text);
        if (spoken.find()) {
            int day = Integer.parseInt(spoken.group(1));
            Integer month = MONTHS.get(normalize(spoken.group(2)));
            int year = spoken.group(3) != null
                    ? Integer.parseInt(spoken.group(3))
                    : today.getYear();
            if (month != null) {
                try {
                    LocalDate d = LocalDate.of(year, month, day);
                    if (spoken.group(3) == null && d.isBefore(today.minusDays(1))) {
                        d = d.plusYears(1);
                    }
                    return d.toString();
                } catch (Exception ignored) {
                    // fall through
                }
            }
        }

        Matcher dmy = DMY.matcher(text);
        if (dmy.find()) {
            int day = Integer.parseInt(dmy.group(1));
            int month = Integer.parseInt(dmy.group(2));
            String yearRaw = dmy.group(3);
            int year = yearRaw == null
                    ? today.getYear()
                    : (yearRaw.length() == 2 ? 2000 + Integer.parseInt(yearRaw) : Integer.parseInt(yearRaw));
            try {
                LocalDate d = LocalDate.of(year, month, day);
                if (yearRaw == null && d.isBefore(today.minusDays(1))) {
                    d = d.plusYears(1);
                }
                return d.toString();
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
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
        if (norm.contains("gallito")) {
            return "RUTA_GALLITO_DE_ROCA";
        }
        if (norm.contains("kirakai")) {
            return "RUTA_RESERVA_KIRAKAI";
        }
        if (norm.contains("pijao")) {
            return "PIJAO_AVES_Y_COMUNIDAD";
        }
        if (norm.contains("birding") || norm.contains("avistamiento") || norm.contains("ornitolog")) {
            return "RUTA_AVES_Y_CAFE";
        }
        if (norm.contains("acaime")) {
            return "ACAIME";
        }
        if ((norm.contains("aves") && norm.contains("cafe")) || norm.contains("ruta aves")) {
            return "RUTA_AVES_Y_CAFE";
        }
        if (norm.contains("cafe") || norm.contains("café") || norm.contains("cafeter") || norm.contains("finca")) {
            return "CAFE";
        }
        if (norm.contains("cocora") || norm.contains("cócora")) {
            return "COCORA";
        }
        if (norm.contains("salento") && (norm.contains("tour") || norm.contains("paquete") || norm.contains("cotiz"))) {
            return "SALENTO_Y_VALLE_DEL_COCORA";
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
