package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.model.QuoteAnalysis;
import com.escuelaaves.sig.domain.port.out.integration.ChatQuoteAnalyzerPort;
import com.escuelaaves.sig.domain.port.out.integration.ClaudeAiPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Analiza el texto del chat (WhatsApp proyectado desde Google Sheets) y arma una
 * cotizacion tentativa: experiencia, numero de personas, fecha y monto estimado.
 *
 * Funciona de inmediato con reglas locales. Cuando Claude AI este CONNECTED,
 * usa la sugerencia del LLM para enriquecer el titulo/descripcion.
 */
@Slf4j
@Component
public class HeuristicChatQuoteAnalyzer implements ChatQuoteAnalyzerPort {

    private static final String CURRENCY = "COP";

    /** Palabras clave -> nombre de experiencia + precio base por persona (COP). */
    private static final List<Experience> EXPERIENCES = List.of(
            new Experience("Avistamiento de aves", 95000,
                    "avistamiento", "aves", "ave", "pajar", "pájar", "bird", "ornitolog"),
            new Experience("Cabalgata ecológica", 85000, "cabalg", "caballo"),
            new Experience("Tour del café", 65000, "café", "cafe", "finca", "barism", "cafetal"),
            new Experience("Valle de Cócora", 70000, "cocora", "cócora", "palma", "wax palm"),
            new Experience("Caminata ecológica", 60000, "caminata", "sender", "trekking", "trekk", "ecolog"),
            new Experience("Camping en Salento", 55000, "camping", "acampar", "carpa"),
            new Experience("Programa educativo escolar", 50000,
                    "colegio", "escolar", "estudiantes", "curso", "taller", "educativ", "excursión", "excursion")
    );

    private static final Pattern PARTY_SIZE = Pattern.compile(
            "(\\d{1,3})\\s*(personas|persona|pax|adultos|adulto|cupos|cupo|ni[nñ]os|ni[nñ]o|gente|integrantes|estudiantes|visitantes|turistas)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PARTY_SIZE_SOMOS = Pattern.compile(
            "(?:somos|seremos|ir[ií]amos|vamos)\\s*(?:un\\s*grupo\\s*de\\s*)?(\\d{1,3})",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE_SLASH = Pattern.compile("\\b(\\d{1,2})[/](\\d{1,2})(?:[/](\\d{2,4}))?\\b");
    private static final Pattern DATE_TEXT = Pattern.compile(
            "\\b(\\d{1,2})\\s*(?:de\\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern MONEY = Pattern.compile(
            "\\$\\s*(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{2})?|\\d{4,})");

    private static final String[] MONTHS = {
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    };

    private final ClaudeAiPort claudeAiPort;

    @Value("${app.ai.quote.base-price-per-person:75000}")
    private long basePricePerPerson;

    public HeuristicChatQuoteAnalyzer(ClaudeAiPort claudeAiPort) {
        this.claudeAiPort = claudeAiPort;
    }

    @Override
    public QuoteAnalysis analyze(ChatQuoteContext context) {
        List<ChatQuoteContext.ChatTurn> turns = context.turns() != null ? context.turns() : List.of();

        StringBuilder clientBuffer = new StringBuilder();
        StringBuilder allBuffer = new StringBuilder();
        for (ChatQuoteContext.ChatTurn turn : turns) {
            if (turn.text() == null || turn.text().isBlank()) {
                continue;
            }
            allBuffer.append(turn.text()).append('\n');
            if (turn.fromClient()) {
                clientBuffer.append(turn.text()).append('\n');
            }
        }
        String clientText = clientBuffer.toString();
        String allText = allBuffer.toString();
        String haystack = (clientText + "\n" + allText).toLowerCase(Locale.ROOT);

        List<String> highlights = new ArrayList<>();
        int confidence = 15;

        Experience experience = detectExperience(haystack);
        boolean experienceMatched = experience != null;
        if (experienceMatched) {
            confidence += 30;
            highlights.add("Experiencia detectada: " + experience.name());
        } else {
            experience = new Experience("Experiencia Escuela Aves Salento", basePricePerPerson);
        }

        int partySize = detectPartySize(haystack);
        if (partySize > 0) {
            confidence += 25;
            highlights.add("Personas: " + partySize);
        } else {
            partySize = 1;
        }

        LocalDate serviceDate = detectDate(allText);
        if (serviceDate != null) {
            confidence += 15;
            highlights.add("Fecha tentativa: " + serviceDate);
        }

        BigDecimal detectedMoney = detectMoney(allText);
        long pricePerPerson = experienceMatched ? experience.pricePerPerson() : basePricePerPerson;
        BigDecimal amount;
        if (detectedMoney.signum() > 0) {
            amount = detectedMoney;
            confidence += 15;
            highlights.add("Monto mencionado en el chat");
        } else {
            amount = BigDecimal.valueOf(pricePerPerson).multiply(BigDecimal.valueOf(partySize));
            highlights.add("Monto estimado: " + partySize + " x $" + String.format(Locale.US, "%,d", pricePerPerson));
        }

        confidence = Math.min(confidence, 95);

        String title = experience.name()
                + (partySize > 1 ? " · " + partySize + " personas" : "");
        String description = buildDescription(context.clientName(), experience, partySize, serviceDate, clientText);
        String analyzer = "HEURISTICA";

        // Enriquecimiento opcional con Claude cuando este disponible.
        if (claudeAiPort.status() == IntegrationStatus.CONNECTED) {
            try {
                String prompt = buildClaudePrompt(context, experience, partySize, serviceDate, amount);
                String suggestion = claudeAiPort.generateSuggestion(prompt);
                if (suggestion != null && !suggestion.isBlank()
                        && !suggestion.toLowerCase(Locale.ROOT).contains("no disponible")) {
                    description = suggestion.trim();
                    analyzer = "CLAUDE_AI";
                    confidence = Math.min(confidence + 5, 99);
                    highlights.add("Descripción generada por Claude AI");
                }
            } catch (Exception ex) {
                log.warn("No se pudo enriquecer la cotización con Claude AI: {}", ex.getMessage());
            }
        }

        LocalDate validUntil = LocalDate.now().plusDays(15);

        return new QuoteAnalysis(
                experience.name(), title, description, partySize,
                amount, CURRENCY, serviceDate, validUntil,
                confidence, analyzer, highlights);
    }

    private Experience detectExperience(String haystack) {
        for (Experience exp : EXPERIENCES) {
            for (String keyword : exp.keywords()) {
                if (haystack.contains(keyword)) {
                    return exp;
                }
            }
        }
        return null;
    }

    private int detectPartySize(String haystack) {
        Matcher m = PARTY_SIZE.matcher(haystack);
        int best = 0;
        while (m.find()) {
            best = Math.max(best, safeInt(m.group(1)));
        }
        if (best == 0) {
            Matcher s = PARTY_SIZE_SOMOS.matcher(haystack);
            if (s.find()) {
                best = safeInt(s.group(1));
            }
        }
        return best > 0 && best <= 500 ? best : 0;
    }

    private LocalDate detectDate(String text) {
        Matcher slash = DATE_SLASH.matcher(text);
        if (slash.find()) {
            int day = safeInt(slash.group(1));
            int month = safeInt(slash.group(2));
            int year = slash.group(3) != null ? normalizeYear(safeInt(slash.group(3))) : LocalDate.now().getYear();
            LocalDate date = buildDate(year, month, day);
            if (date != null) {
                return date;
            }
        }
        Matcher textual = DATE_TEXT.matcher(text.toLowerCase(Locale.ROOT));
        if (textual.find()) {
            int day = safeInt(textual.group(1));
            int month = monthIndex(textual.group(2));
            if (month > 0) {
                int year = LocalDate.now().getYear();
                LocalDate date = buildDate(year, month, day);
                if (date != null && date.isBefore(LocalDate.now())) {
                    date = date.plusYears(1);
                }
                return date;
            }
        }
        return null;
    }

    private BigDecimal detectMoney(String text) {
        Matcher m = MONEY.matcher(text);
        BigDecimal best = BigDecimal.ZERO;
        while (m.find()) {
            BigDecimal value = sanitize(m.group(1));
            if (value.compareTo(best) > 0) {
                best = value;
            }
        }
        return best;
    }

    private BigDecimal sanitize(String token) {
        if (token == null || token.isBlank()) {
            return BigDecimal.ZERO;
        }
        String t = token.trim();
        if (t.matches("19\\d{2}|20\\d{2}")) {
            return BigDecimal.ZERO;
        }
        try {
            if (t.matches("\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?")) {
                t = t.replace(".", "").replace(",", ".");
            } else if (t.matches("\\d{1,3}(,\\d{3})+(\\.\\d{1,2})?")) {
                t = t.replace(",", "");
            } else if (t.contains(",") && !t.contains(".")) {
                t = t.replace(",", ".");
            }
            BigDecimal value = new BigDecimal(t);
            if (value.compareTo(BigDecimal.valueOf(10_000)) < 0
                    || value.compareTo(BigDecimal.valueOf(500_000_000L)) > 0) {
                return BigDecimal.ZERO;
            }
            return value;
        } catch (Exception ex) {
            return BigDecimal.ZERO;
        }
    }

    private String buildDescription(String clientName, Experience experience, int partySize,
                                    LocalDate serviceDate, String clientText) {
        StringBuilder sb = new StringBuilder();
        sb.append("Cotización generada por el asistente de IA a partir del chat de WhatsApp");
        if (clientName != null && !clientName.isBlank()) {
            sb.append(" con ").append(clientName.trim());
        }
        sb.append(".\n\n");
        sb.append("• Experiencia: ").append(experience.name()).append('\n');
        sb.append("• Personas: ").append(partySize).append('\n');
        if (serviceDate != null) {
            sb.append("• Fecha tentativa: ").append(serviceDate).append('\n');
        }
        String resumen = summarizeClient(clientText);
        if (!resumen.isBlank()) {
            sb.append("\nSolicitud del cliente:\n\"").append(resumen).append("\"");
        }
        return sb.toString();
    }

    private String summarizeClient(String clientText) {
        if (clientText == null || clientText.isBlank()) {
            return "";
        }
        String cleaned = clientText.replaceAll("\\s+", " ").trim();
        return cleaned.length() > 400 ? cleaned.substring(0, 397) + "..." : cleaned;
    }

    private String buildClaudePrompt(ChatQuoteContext context, Experience experience,
                                     int partySize, LocalDate serviceDate, BigDecimal amount) {
        StringBuilder sb = new StringBuilder();
        sb.append("Eres asesor comercial de Escuela Aves Salento. Redacta una descripción breve y ")
                .append("profesional para una cotización basada en este chat de WhatsApp.\n");
        sb.append("Experiencia sugerida: ").append(experience.name()).append('\n');
        sb.append("Personas: ").append(partySize).append('\n');
        if (serviceDate != null) {
            sb.append("Fecha: ").append(serviceDate).append('\n');
        }
        sb.append("Monto estimado: ").append(amount).append(" COP\n\nChat:\n");
        for (ChatQuoteContext.ChatTurn turn : context.turns()) {
            sb.append(turn.fromClient() ? "Cliente: " : "Asesor: ").append(turn.text()).append('\n');
        }
        return sb.toString();
    }

    private static int safeInt(String value) {
        try {
            return Integer.parseInt(value.trim());
        } catch (Exception ex) {
            return 0;
        }
    }

    private static int normalizeYear(int year) {
        if (year < 100) {
            return 2000 + year;
        }
        return year;
    }

    private static int monthIndex(String month) {
        String m = month.toLowerCase(Locale.ROOT);
        if (m.startsWith("setiembre")) {
            return 9;
        }
        for (int i = 0; i < MONTHS.length; i++) {
            if (MONTHS[i].equals(m)) {
                return i + 1;
            }
        }
        return 0;
    }

    private static LocalDate buildDate(int year, int month, int day) {
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        try {
            return LocalDate.of(year, month, day);
        } catch (Exception ex) {
            return null;
        }
    }

    private record Experience(String name, long pricePerPerson, String... keywords) {
    }
}
