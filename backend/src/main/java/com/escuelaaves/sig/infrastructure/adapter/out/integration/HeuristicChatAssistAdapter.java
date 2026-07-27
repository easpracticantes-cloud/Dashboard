package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.ChatQuoteContext.ChatTurn;
import com.escuelaaves.sig.domain.model.ChatSentiment;
import com.escuelaaves.sig.domain.model.ChatSummary;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.ChatAssistPort;
import com.escuelaaves.sig.domain.port.out.integration.ClaudeAiPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Asistencia conversacional con reglas locales (funciona sin configuracion) y
 * enriquecimiento opcional con Claude AI cuando la integracion esta CONNECTED.
 */
@Slf4j
@Component
public class HeuristicChatAssistAdapter implements ChatAssistPort {

    private static final String[][] EXPERIENCE_KEYWORDS = {
            {"Avistamiento de aves", "avistamiento", "aves", "ave", "pajar", "pájar", "bird", "ornitolog"},
            {"Cabalgata ecológica", "cabalg", "caballo"},
            {"Tour del café", "café", "cafe", "finca", "barism", "cafetal"},
            {"Valle de Cócora", "cocora", "cócora", "palma"},
            {"Caminata ecológica", "caminata", "sender", "trekking", "ecolog"},
            {"Camping en Salento", "camping", "acampar", "carpa"},
            {"Programa educativo escolar", "colegio", "escolar", "estudiantes", "curso", "taller", "educativ"}
    };

    private static final String[] POSITIVE = {
            "gracias", "excelente", "perfecto", "genial", "me encanta", "encantó", "encanto",
            "listo", "de una", "buenísimo", "buenisimo", "súper", "super", "increíble", "increible", "😊", "🙌", "❤"
    };
    private static final String[] RISK = {
            "molesto", "molesta", "queja", "reclamo", "mal", "pésimo", "pesimo", "tarde", "demora",
            "caro", "carísimo", "carisimo", "cancelar", "cancelo", "no me gusta", "espere", "esperando", "😡", "😠"
    };
    private static final String[] URGENT = {
            "urgente", "hoy", "ya", "ahora", "rápido", "rapido", "de inmediato", "inmediato", "para hoy", "mañana", "manana"
    };

    private final ClaudeAiPort claudeAiPort;

    public HeuristicChatAssistAdapter(ClaudeAiPort claudeAiPort) {
        this.claudeAiPort = claudeAiPort;
    }

    @Override
    public String suggestReply(ChatQuoteContext context) {
        String name = firstName(context.clientName());
        String lastInbound = lastClientMessage(context);
        String experience = detectExperience(lastInbound + " " + allText(context));

        String claude = tryClaude("Redacta SOLO el texto de una respuesta breve, cálida y profesional de WhatsApp "
                + "para Escuela Aves Salento. Trata al cliente por su nombre si lo hay. No incluyas comillas.", context);
        if (claude != null) {
            return claude;
        }

        StringBuilder sb = new StringBuilder();
        sb.append(name.isBlank() ? "¡Hola! 🌿 " : "¡Hola " + name + "! 🌿 ");
        sb.append("Gracias por escribir a Escuela Aves Salento. ");
        if (experience != null) {
            sb.append("Con gusto te ayudo con ").append(experience.toLowerCase(Locale.ROOT)).append(". ");
        } else {
            sb.append("Con gusto te ayudo con tu experiencia de naturaleza en Salento. ");
        }
        sb.append("Para armarte la mejor propuesta, ¿me confirmas la fecha tentativa y cuántas personas serían? ");
        sb.append("Así te preparo la cotización de una vez. 🐦");
        return sb.toString();
    }

    @Override
    public ChatSummary summarize(ChatQuoteContext context) {
        String all = allText(context);
        List<String> keyPoints = new ArrayList<>();

        String experience = detectExperience(all);
        if (experience != null) {
            keyPoints.add("Interés: " + experience);
        }
        int party = detectPartySize(all);
        if (party > 0) {
            keyPoints.add("Personas: " + party);
        }
        long clientMsgs = context.turns() == null ? 0
                : context.turns().stream().filter(ChatTurn::fromClient).count();
        keyPoints.add("Mensajes del cliente: " + clientMsgs);

        ChatSentiment sentiment = analyzeSentiment(context);
        keyPoints.add("Sentimiento: " + sentiment.sentiment() + " · Urgencia: " + sentiment.urgency());

        String claude = tryClaude("Resume en 2 frases esta conversación de WhatsApp para un asesor comercial. "
                + "Devuelve solo el resumen.", context);
        String summary = claude != null
                ? claude
                : buildSummary(context.clientName(), experience, party, clientMsgs);

        String nextStep = buildNextStep(experience, party, sentiment);
        return new ChatSummary(summary, keyPoints, nextStep, claude != null ? "CLAUDE_AI" : "HEURISTICA");
    }

    @Override
    public ChatSentiment analyzeSentiment(ChatQuoteContext context) {
        String clientText = clientText(context).toLowerCase(Locale.ROOT);
        List<String> signals = new ArrayList<>();

        int positive = countMatches(clientText, POSITIVE, signals, "Tono positivo");
        int risk = countMatches(clientText, RISK, signals, "Posible molestia/objeción");
        int urgent = countMatches(clientText, URGENT, signals, "Urgencia detectada");

        int score = positive * 25 - risk * 30;
        score = Math.max(-100, Math.min(100, score));

        String sentiment;
        if (risk > positive) {
            sentiment = "RIESGO";
        } else if (positive > 0) {
            sentiment = "POSITIVO";
        } else {
            sentiment = "NEUTRO";
        }

        String urgency = urgent >= 2 ? "ALTA" : (urgent == 1 ? "MEDIA" : "BAJA");
        String intent = detectExperience(allText(context)) != null ? "Cotización de experiencia" : "Consulta general";

        if (signals.isEmpty()) {
            signals.add("Sin señales fuertes; tono neutral");
        }
        return new ChatSentiment(sentiment, intent, urgency, score, signals);
    }

    // ---------- helpers ----------

    private String tryClaude(String instruction, ChatQuoteContext context) {
        if (claudeAiPort.status() != IntegrationStatus.CONNECTED) {
            return null;
        }
        try {
            StringBuilder prompt = new StringBuilder(instruction).append("\n\nChat:\n");
            for (ChatTurn turn : safeTurns(context)) {
                prompt.append(turn.fromClient() ? "Cliente: " : "Asesor: ").append(turn.text()).append('\n');
            }
            String out = claudeAiPort.generateSuggestion(prompt.toString());
            if (out != null && !out.isBlank() && !out.toLowerCase(Locale.ROOT).contains("no disponible")) {
                return out.trim();
            }
        } catch (Exception ex) {
            log.warn("Claude AI no disponible para asistencia: {}", ex.getMessage());
        }
        return null;
    }

    private String buildSummary(String clientName, String experience, int party, long clientMsgs) {
        StringBuilder sb = new StringBuilder();
        sb.append(clientName != null && !clientName.isBlank() ? clientName.trim() : "El cliente");
        sb.append(" escribió por WhatsApp");
        if (experience != null) {
            sb.append(" interesado en ").append(experience.toLowerCase(Locale.ROOT));
        }
        if (party > 0) {
            sb.append(" para ").append(party).append(" personas");
        }
        sb.append(". ");
        sb.append("Se registran ").append(clientMsgs).append(" mensajes del cliente en el hilo.");
        return sb.toString();
    }

    private String buildNextStep(String experience, int party, ChatSentiment sentiment) {
        if ("RIESGO".equals(sentiment.sentiment())) {
            return "Responder rápido para recuperar la confianza y aclarar dudas.";
        }
        if (experience != null && party > 0) {
            return "Generar la cotización con IA y enviarla al cliente.";
        }
        if (experience != null) {
            return "Confirmar fecha y número de personas para cotizar.";
        }
        return "Preguntar qué experiencia busca y para cuántas personas.";
    }

    private int countMatches(String text, String[] words, List<String> signals, String label) {
        int count = 0;
        for (String w : words) {
            if (text.contains(w)) {
                count++;
            }
        }
        if (count > 0) {
            signals.add(label);
        }
        return count;
    }

    private String detectExperience(String text) {
        if (text == null) {
            return null;
        }
        String h = text.toLowerCase(Locale.ROOT);
        for (String[] row : EXPERIENCE_KEYWORDS) {
            for (int i = 1; i < row.length; i++) {
                if (h.contains(row[i])) {
                    return row[0];
                }
            }
        }
        return null;
    }

    private int detectPartySize(String text) {
        if (text == null) {
            return 0;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(
                "(\\d{1,3})\\s*(personas|persona|pax|adultos|ni[nñ]os|estudiantes|gente|integrantes)",
                java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        int best = 0;
        while (m.find()) {
            try {
                best = Math.max(best, Integer.parseInt(m.group(1)));
            } catch (Exception ignored) {
                // no-op
            }
        }
        return best <= 500 ? best : 0;
    }

    private List<ChatTurn> safeTurns(ChatQuoteContext context) {
        return context.turns() != null ? context.turns() : List.of();
    }

    private String allText(ChatQuoteContext context) {
        StringBuilder sb = new StringBuilder();
        for (ChatTurn t : safeTurns(context)) {
            if (t.text() != null) {
                sb.append(t.text()).append('\n');
            }
        }
        return sb.toString();
    }

    private String clientText(ChatQuoteContext context) {
        StringBuilder sb = new StringBuilder();
        for (ChatTurn t : safeTurns(context)) {
            if (t.fromClient() && t.text() != null) {
                sb.append(t.text()).append('\n');
            }
        }
        return sb.toString();
    }

    private String lastClientMessage(ChatQuoteContext context) {
        String last = "";
        for (ChatTurn t : safeTurns(context)) {
            if (t.fromClient() && t.text() != null && !t.text().isBlank()) {
                last = t.text();
            }
        }
        return last;
    }

    private String firstName(String clientName) {
        if (clientName == null || clientName.isBlank()) {
            return "";
        }
        String trimmed = clientName.trim();
        int space = trimmed.indexOf(' ');
        return space > 0 ? trimmed.substring(0, space) : trimmed;
    }
}
