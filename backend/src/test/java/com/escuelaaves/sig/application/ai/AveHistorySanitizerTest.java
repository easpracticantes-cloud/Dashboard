package com.escuelaaves.sig.application.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AveHistorySanitizerTest {

    @Test
    void stripsExactUserReportedRefusal() {
        String old = "eso está un poco fuera de mi cancha. Yo soy Ave, asistente de Escuela Aves Salento…";
        assertTrue(AveHistorySanitizer.looksLikeStalePersona(old));
        assertEquals(AveHistorySanitizer.OMITTED, AveHistorySanitizer.sanitizeTurn("assistant", old));
    }

    @Test
    void stripsFocusedOnToursPersona() {
        String old = "Soy Ave, asistente de Escuela Aves Salento. Estoy enfocada en tours y reservas.";
        assertEquals(AveHistorySanitizer.OMITTED, AveHistorySanitizer.sanitizeTurn("assistant", old));
    }

    @Test
    void keepsNormalAnswers() {
        String ok = "Albert Einstein fue un físico teórico nacido en 1879.";
        assertFalse(AveHistorySanitizer.looksLikeStalePersona(ok));
        assertEquals(ok, AveHistorySanitizer.sanitizeTurn("assistant", ok));
        assertEquals("¿Quién fue Einstein?", AveHistorySanitizer.sanitizeTurn("user", "¿Quién fue Einstein?"));
    }
}
