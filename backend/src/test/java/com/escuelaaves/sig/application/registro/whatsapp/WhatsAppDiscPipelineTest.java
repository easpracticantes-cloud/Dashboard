package com.escuelaaves.sig.application.registro.whatsapp;

import com.escuelaaves.sig.application.ai.DiscStyleClassifier;
import com.escuelaaves.sig.domain.ai.model.DiscProfile;
import com.escuelaaves.sig.domain.ai.model.SeguimientoExtraction;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class WhatsAppDiscPipelineTest {

    @Test
    void chatDeProspectoPrellenaCampoDisc() {
        String chat = """
                12/8/2026, 10:00 - Juan: Precio?
                12/8/2026, 10:01 - Andrea: Claro, te paso valores
                12/8/2026, 10:02 - Juan: ¿Hay cupo mañana?
                12/8/2026, 10:03 - Juan: Confírmame.
                """;
        var parsed = WhatsAppChatParser.parse("WhatsApp Chat - Juan.txt", chat);
        DiscProfile local = DiscStyleClassifier.classify(WhatsAppChatParser.prospectTexts(parsed));
        DiscProfile merged = DiscProfile.mergePreferringModel(DiscProfile.undetermined(), local);
        var extraction = emptyExtraction().withDisc(merged);
        assertEquals("D", extraction.valor("disc"));
        assertEquals("INFERIDO", extraction.campos().get("disc").estado());
        assertEquals("D", extraction.discAnalisis().disc());
    }

    @Test
    void saludoSoloNoRellenaDisc() {
        String chat = """
                12/8/2026, 10:00 - Juan: Hola
                12/8/2026, 10:01 - Andrea: ¡Hola! ¿En qué te ayudo?
                """;
        var parsed = WhatsAppChatParser.parse("chat.txt", chat);
        DiscProfile local = DiscStyleClassifier.classify(WhatsAppChatParser.prospectTexts(parsed));
        var extraction = emptyExtraction().withDisc(local);
        assertNull(extraction.valor("disc"));
        assertEquals("NO_ENCONTRADO", extraction.campos().get("disc").estado());
    }

    private static SeguimientoExtraction emptyExtraction() {
        LinkedHashMap<String, SeguimientoExtraction.FieldValue> campos = new LinkedHashMap<>();
        campos.put("disc", SeguimientoExtraction.FieldValue.of(null, "NO_ENCONTRADO", 0));
        return new SeguimientoExtraction(campos, null, List.of(), null, null);
    }
}
