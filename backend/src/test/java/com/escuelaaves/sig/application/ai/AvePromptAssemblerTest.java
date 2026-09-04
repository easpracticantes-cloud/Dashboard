package com.escuelaaves.sig.application.ai;

import org.junit.jupiter.api.Test;

import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AvePromptAssemblerTest {

    @Test
    void einsteinIsGeneralWithoutCommercialIdentity() {
        assertFalse(SigTopicDetector.needsBusinessContext("¿Quién fue Einstein?"));
        var a = AvePromptAssembler.assemble("¿Quién fue Einstein?", "(sin historial previo)", false, null, null);
        assertFalse(a.businessTurn());
        assertFalse(a.catalogPresent());
        assertFalse(a.commercialIdentityInSystem());
        assertFalse(a.systemSources().stream().anyMatch(s -> s.contains("SIG") || s.contains("catalog")));
        assertEquals(AveSystemPrompt.SYSTEM, a.system());
        assertFalse(a.system().toLowerCase(Locale.ROOT).contains("escuela"));
        assertFalse(a.system().toLowerCase(Locale.ROOT).contains("tour"));
        assertFalse(a.system().toLowerCase(Locale.ROOT).contains("cancha"));
    }

    @Test
    void dockerAndPythonAndMathAndEmailAreGeneral() {
        for (String q : new String[]{
                "¿Cómo funciona Docker?",
                "¿Qué es Python?",
                "¿Cuánto es 25 × 38?",
                "Ayúdame a redactar un correo profesional."
        }) {
            assertFalse(SigTopicDetector.needsBusinessContext(q), q);
            var a = AvePromptAssembler.assemble(q, "(sin historial previo)", false, "TOUR ACAIME", "{tour:ACAIME}");
            assertEquals(AveSystemPrompt.SYSTEM, a.system(), q);
            assertFalse(a.commercialIdentityInSystem(), q);
            assertFalse(a.system().contains("ACAIME"), q);
        }
    }

    @Test
    void trekkingQuestionActivatesBusinessContext() {
        String q = "¿Qué tours de trekking tenemos?";
        assertTrue(SigTopicDetector.needsBusinessContext(q));
        var a = AvePromptAssembler.assemble(q, "(sin historial previo)", true, "TOUR TREKKING ACAIME", "{\"tourCode\":\"ACAIME\"}");
        assertTrue(a.businessTurn());
        assertTrue(a.catalogPresent());
        assertTrue(a.systemSources().stream().anyMatch(s -> s.contains("SIG_APPENDIX")));
        assertTrue(a.system().contains("ACAIME"));
    }

    @Test
    void priorBusinessTurnDoesNotBleedIntoEinsteinSystem() {
        String history = """
                user: ¿Qué tours tenemos?
                assistant: Tenemos Acaime, Cocora y rafting. ¿Cotizamos?
                """;
        assertFalse(SigTopicDetector.needsBusinessContext("¿Quién fue Einstein?"));
        var a = AvePromptAssembler.assemble("¿Quién fue Einstein?", history, false, "SHOULD_NOT_APPEAR", "{}");
        assertEquals(AveSystemPrompt.SYSTEM, a.system());
        assertFalse(a.system().contains("SHOULD_NOT_APPEAR"));
        assertFalse(a.system().contains("ACAIME"));
    }

    @Test
    void contaminatedHistoryIsSanitizedInUserPayload() {
        String history = """
                user: hola
                assistant: Soy Ave, asistente de Escuela Aves Salento. Estoy enfocada en tours y reservas.
                """;
        var a = AvePromptAssembler.assemble("¿Quién fue Einstein?", history, false, null, null);
        assertFalse(a.commercialIdentityInSystem());
        assertTrue(a.user().contains(AveHistorySanitizer.OMITTED)
                || !a.user().toLowerCase(Locale.ROOT).contains("escuela aves salento"));
        assertFalse(AvePromptAssembler.looksLikeCommercialRefusal(
                "Albert Einstein fue un físico teórico que desarrolló la relatividad."));
        assertTrue(AvePromptAssembler.looksLikeCommercialRefusal(
                "eso está un poco fuera de mi cancha. Yo soy Ave, asistente de Escuela Aves Salento…"));
    }
}
