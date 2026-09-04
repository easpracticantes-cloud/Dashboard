package com.escuelaaves.sig.application.ai;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AveSystemPromptTest {

    private static final List<String> FORBIDDEN_IN_GENERAL = List.of(
            "escuela aves",
            "aves salento",
            "salento",
            "tour",
            "tarifa",
            "reserva",
            "jeep",
            "acaime",
            "proveedor",
            "cancha",
            "chatgpt",
            "google",
            // palabra completa "sig" (no subcadena de "inteligencia", etc.)
            " sig ",
            "sig)",
            "(sig"
    );

    @Test
    void generalSystemHasZeroCommercialIdentity() {
        String p = AveSystemPrompt.SYSTEM.toLowerCase(Locale.ROOT);
        assertTrue(p.contains("eres ave"));
        assertTrue(p.contains("propósito general") || p.contains("proposito general"));
        for (String banned : FORBIDDEN_IN_GENERAL) {
            assertFalse(p.contains(banned), "SYSTEM general no debe contener: " + banned);
        }
        assertFalse(AvePromptAssembler.containsCommercialIdentity(AveSystemPrompt.SYSTEM));
    }
}
