package com.escuelaaves.sig.domain.model;

import java.util.List;

/**
 * Resumen inteligente de una conversacion (WhatsApp/Sheets).
 */
public record ChatSummary(
        String summary,
        List<String> keyPoints,
        String nextStep,
        String analyzer
) {
}
