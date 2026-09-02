package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.AiModelTier;
import com.escuelaaves.sig.domain.ai.model.ComplexityScore;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Enruta operaciones de IA a Haiku (FAST) o Sonnet (REASONING).
 * Combina nombre de operación + score de complejidad del texto.
 */
@Component
public class AiModelRouter {

    public AiModelTier resolve(String operation) {
        return resolve(operation, null).recommendedTier();
    }

    public ComplexityScore resolve(String operation, String text) {
        int score = 0;
        StringBuilder why = new StringBuilder();

        String op = operation == null ? "" : operation.trim().toLowerCase(Locale.ROOT);
        score += switch (op) {
            case "actions", "actionsexecute", "action_plan", "review", "conflict", "complex_chat" -> {
                why.append("op=").append(op).append("+40;");
                yield 40;
            }
            case "interpretquote", "extractreservation", "classify" -> {
                why.append("op-extract+10;");
                yield 10;
            }
            default -> 0;
        };

        if (text != null && !text.isBlank()) {
            String t = text.toLowerCase(Locale.ROOT);
            int constraints = 0;
            if (t.contains("privado") || t.contains("compartido")) constraints++;
            if (t.contains("b2b") || t.contains("empresa") || t.contains("corporativ")) constraints++;
            if (t.contains("inglés") || t.contains("ingles") || t.contains("english") || t.contains("french")) constraints++;
            if (t.contains(" y ") && (t.contains("tour") || t.contains("acaime") || t.contains("rafting"))) constraints++;
            if (constraints >= 3) {
                score += 35;
                why.append("multi-constraint=").append(constraints).append('+');
            } else if (constraints == 2) {
                score += 20;
                why.append("dual-constraint;");
            }
            if (t.length() > 1200) {
                score += 15;
                why.append("long-input;");
            }
            if (t.contains("inconsisten") || t.contains("conflicto") || t.contains("no cuadra") || t.contains("revisar")) {
                score += 25;
                why.append("conflict-signal;");
            }
        }

        return ComplexityScore.of(score, why.toString());
    }
}
