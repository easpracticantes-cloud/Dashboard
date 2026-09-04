package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.application.ai.CatalogQuoteService;
import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.model.QuoteAnalysis;
import com.escuelaaves.sig.domain.port.out.integration.ChatQuoteAnalyzerPort;
import com.escuelaaves.sig.domain.port.out.integration.ClaudeAiPort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Analiza el chat CRM y cotiza con el mismo catálogo {@code ai/catalogo/} que Ave/Consola.
 * Ya no usa precios hardcodeados: el PricingEngine (CatalogQuoteService) es la fuente de verdad.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HeuristicChatQuoteAnalyzer implements ChatQuoteAnalyzerPort {

    private static final String CURRENCY = "COP";

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
    private final CatalogQuoteService catalogQuoteService;

    @Value("${app.ai.quote.base-price-per-person:75000}")
    private long basePricePerPerson;

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
        int confidence = 20;

        int partySize = detectPartySize(haystack);
        if (partySize > 0) {
            confidence += 20;
            highlights.add("Personas: " + partySize);
        } else {
            partySize = 2;
            highlights.add("Personas no claras — se asume 2 (catálogo)");
        }

        LocalDate serviceDate = detectDate(allText);
        if (serviceDate != null) {
            confidence += 10;
            highlights.add("Fecha tentativa: " + serviceDate);
        }

        String natural = buildNaturalQuery(partySize, clientText, allText);
        Optional<CatalogQuoteService.QuoteResult> priced = catalogQuoteService.tryQuote(natural);

        String experienceName;
        BigDecimal amount;
        String analyzer;
        String description;

        if (priced.isPresent()) {
            CatalogQuoteService.QuoteResult q = priced.get();
            experienceName = q.name();
            amount = q.total();
            analyzer = "CATALOGO";
            confidence = Math.min(confidence + 45, 95);
            if (q.reviewFlag()) {
                confidence = Math.min(confidence, 80);
                highlights.add("Tarifa marcada para revisión comercial");
            }
            highlights.add("Precio desde ai/catalogo/: " + q.code());
            highlights.add("Unitario: " + q.unitPrice() + " × " + q.people());
            partySize = q.people();
            description = buildCatalogDescription(context.clientName(), q, serviceDate, clientText);
        } else {
            experienceName = "Experiencia Escuela Aves Salento";
            amount = BigDecimal.valueOf(basePricePerPerson).multiply(BigDecimal.valueOf(partySize));
            analyzer = "HEURISTICA_SIN_CATALOGO";
            confidence = Math.min(confidence, 40);
            highlights.add("Sin match en ai/catalogo/ — monto base provisional (requiere revisión)");
            description = buildFallbackDescription(context.clientName(), experienceName, partySize, serviceDate, clientText);
        }

        BigDecimal detectedMoney = detectMoney(allText);
        if (detectedMoney.signum() > 0) {
            highlights.add("Monto mencionado en chat: " + detectedMoney + " COP (informativo; no reemplaza catálogo)");
            confidence = Math.min(confidence + 5, 95);
        }

        // Enriquecimiento opcional con Claude cuando este disponible.
        if (claudeAiPort.status() == IntegrationStatus.CONNECTED) {
            try {
                String prompt = buildClaudePrompt(context, experienceName, partySize, serviceDate, amount);
                String suggestion = claudeAiPort.generateSuggestion(prompt);
                if (suggestion != null && !suggestion.isBlank()
                        && !suggestion.toLowerCase(Locale.ROOT).contains("no disponible")) {
                    description = suggestion.trim();
                    analyzer = analyzer + "+CLAUDE";
                    confidence = Math.min(confidence + 3, 99);
                    highlights.add("Descripción enriquecida por Claude AI");
                }
            } catch (Exception ex) {
                log.warn("No se pudo enriquecer la cotización con Claude AI: {}", ex.getMessage());
            }
        }

        String title = experienceName + (partySize > 1 ? " · " + partySize + " personas" : "");
        LocalDate validUntil = LocalDate.now().plusDays(15);

        return new QuoteAnalysis(
                experienceName, title, description, partySize,
                amount, CURRENCY, serviceDate, validUntil,
                confidence, analyzer, highlights);
    }

    private static String buildNaturalQuery(int partySize, String clientText, String allText) {
        String base = (clientText != null && !clientText.isBlank()) ? clientText : allText;
        return partySize + " personas. " + (base != null ? base.trim() : "");
    }

    private String buildCatalogDescription(String clientName, CatalogQuoteService.QuoteResult q,
                                           LocalDate serviceDate, String clientText) {
        StringBuilder sb = new StringBuilder();
        sb.append("Cotización generada desde el catálogo comercial (ai/catalogo/)");
        if (clientName != null && !clientName.isBlank()) {
            sb.append(" para ").append(clientName.trim());
        }
        sb.append(".\n\n");
        sb.append("• Servicio: ").append(q.name()).append(" (").append(q.code()).append(")\n");
        if (q.modality() != null) {
            sb.append("• Modalidad: ").append(q.modality()).append('\n');
        }
        sb.append("• Personas: ").append(q.people()).append('\n');
        sb.append("• Precio/persona: ").append(q.unitPrice()).append(" ").append(q.currency()).append('\n');
        sb.append("• Total: ").append(q.total()).append(" ").append(q.currency()).append('\n');
        if (serviceDate != null) {
            sb.append("• Fecha tentativa: ").append(serviceDate).append('\n');
        }
        if (q.includes() != null && !q.includes().isBlank()) {
            sb.append("\nIncluye: ").append(q.includes()).append('\n');
        }
        if (q.excludes() != null && !q.excludes().isBlank()) {
            sb.append("No incluye: ").append(q.excludes()).append('\n');
        }
        String resumen = summarizeClient(clientText);
        if (!resumen.isBlank()) {
            sb.append("\nSolicitud del cliente:\n\"").append(resumen).append("\"");
        }
        return sb.toString();
    }

    private String buildFallbackDescription(String clientName, String experienceName, int partySize,
                                            LocalDate serviceDate, String clientText) {
        StringBuilder sb = new StringBuilder();
        sb.append("Borrador provisional: no se encontró tarifa en ai/catalogo/.\n");
        sb.append("Revisa y cotiza manualmente o reformula la solicitud.\n\n");
        sb.append("• Título tentativo: ").append(experienceName).append('\n');
        sb.append("• Personas: ").append(partySize).append('\n');
        if (serviceDate != null) {
            sb.append("• Fecha tentativa: ").append(serviceDate).append('\n');
        }
        if (clientName != null && !clientName.isBlank()) {
            sb.append("• Cliente: ").append(clientName.trim()).append('\n');
        }
        String resumen = summarizeClient(clientText);
        if (!resumen.isBlank()) {
            sb.append("\nSolicitud:\n\"").append(resumen).append("\"");
        }
        return sb.toString();
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

    private String summarizeClient(String clientText) {
        if (clientText == null || clientText.isBlank()) {
            return "";
        }
        String cleaned = clientText.replaceAll("\\s+", " ").trim();
        return cleaned.length() > 400 ? cleaned.substring(0, 397) + "..." : cleaned;
    }

    private String buildClaudePrompt(ChatQuoteContext context, String experienceName,
                                     int partySize, LocalDate serviceDate, BigDecimal amount) {
        StringBuilder sb = new StringBuilder();
        sb.append("Eres asesor comercial de Escuela Aves Salento. Redacta una descripción breve y ")
                .append("profesional para una cotización basada en este chat de WhatsApp.\n");
        sb.append("Experiencia sugerida: ").append(experienceName).append('\n');
        sb.append("Personas: ").append(partySize).append('\n');
        if (serviceDate != null) {
            sb.append("Fecha: ").append(serviceDate).append('\n');
        }
        sb.append("Monto (catálogo): ").append(amount).append(" COP\n\nChat:\n");
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
}
