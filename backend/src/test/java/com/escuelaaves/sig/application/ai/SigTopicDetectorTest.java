package com.escuelaaves.sig.application.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SigTopicDetectorTest {

    @Test
    void generalQuestionsDoNotAttachSig() {
        assertFalse(SigTopicDetector.needsBusinessContext("¿Quién fue Einstein?"));
        assertFalse(SigTopicDetector.needsBusinessContext("¿Cómo funciona Docker?"));
        assertFalse(SigTopicDetector.needsBusinessContext("¿Qué es Python?"));
        assertFalse(SigTopicDetector.needsBusinessContext("¿Cuánto es 25 × 38?"));
        assertFalse(SigTopicDetector.needsBusinessContext("Ayúdame a redactar un correo profesional."));
        assertFalse(SigTopicDetector.needsBusinessContext("¿Y por qué?"));
    }

    @Test
    void businessQuestionsAttachSig() {
        assertTrue(SigTopicDetector.needsBusinessContext("¿Qué tours de trekking tenemos?"));
        assertTrue(SigTopicDetector.needsBusinessContext("¿Cuánto cuesta Acaime para 4 personas?"));
        assertTrue(SigTopicDetector.needsBusinessContext("Necesito cotizar Trekking en RN Acaime para 2 personas."));
    }
}
