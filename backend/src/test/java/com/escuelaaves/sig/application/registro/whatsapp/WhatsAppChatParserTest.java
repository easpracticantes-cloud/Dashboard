package com.escuelaaves.sig.application.registro.whatsapp;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WhatsAppChatParserTest {

    private static final String CHAT = """
            12/8/2026, 10:00 - Juan Pérez: Hola quiero cotizar Salento 4 personas
            12/8/2026, 10:05 - Andrea: La salida vale $180.000 pp
            12/8/2026, 10:20 - Juan Pérez: y si somos 6?
            12/8/2026, 10:22 - Andrea: Para 6 queda en $160.000 pp
            12/8/2026, 10:30 - Juan Pérez: lo voy a pensar, es un poco caro
            """;

    @Test
    void parseaFechasRemitentesYMensajesAndroid() {
        var parsed = WhatsAppChatParser.parse("WhatsApp Chat - Juan.txt", CHAT);
        assertEquals(5, parsed.messages().size());
        assertEquals("Juan Pérez", parsed.messages().getFirst().sender());
        assertTrue(parsed.messages().getFirst().text().contains("Salento"));
    }

    @Test
    void laUltimaCotizacionNoEsElUltimoMensaje() {
        var parsed = WhatsAppChatParser.parse("chat.txt", CHAT);
        var lastQuote = WhatsAppChatParser.lastQuoteLike(parsed.messages());
        assertTrue(lastQuote.isPresent());
        assertTrue(lastQuote.get().text().contains("160.000"));
        assertTrue(parsed.messages().getLast().text().contains("pensar"));
    }

    @Test
    void parseaFormatoIos() {
        String ios = """
                [12/8/26, 10:05:00] Andrea: Cotización rafting $250.000
                [12/8/26, 10:06:00] Cliente: ok gracias
                """;
        var parsed = WhatsAppChatParser.parse("chat.txt", ios);
        assertEquals(2, parsed.messages().size());
        assertTrue(parsed.messages().getFirst().quoteLike());
    }

    @Test
    void infiereCelularDelNombreDeArchivo() {
        var parsed = WhatsAppChatParser.parse("WhatsApp Chat with +57 300 123 4567.txt", CHAT);
        assertEquals("573001234567", parsed.inferredPhone());
    }

    @Test
    void compactaChatsLargosSinPerderLaUltimaCotizacion() {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= 300; i++) {
            sb.append("1/1/2026, 10:00 - Cliente: mensaje ").append(i).append('\n');
        }
        sb.append("1/1/2026, 18:00 - Andrea: cotización final $99.000 pp\n");
        var parsed = WhatsAppChatParser.parse("largo.txt", sb.toString());
        List<WhatsAppChatParser.WhatsAppMessage> compact =
                WhatsAppChatParser.compactForModel(parsed.messages(), 80);
        assertTrue(compact.size() <= 80);
        assertTrue(compact.stream().anyMatch(m -> m.text().contains("99.000")));
    }

    @Test
    void objecionQuedaEnElHistorial() {
        var parsed = WhatsAppChatParser.parse("chat.txt", CHAT);
        assertTrue(parsed.messages().getLast().text().toLowerCase().contains("caro"));
    }

    @Test
    void separaProspectoDeAsesor() {
        var parsed = WhatsAppChatParser.parse("WhatsApp Chat - Juan.txt", CHAT);
        var texts = WhatsAppChatParser.prospectTexts(parsed);
        assertEquals(3, texts.size());
        assertTrue(texts.getFirst().contains("Salento"));
        assertTrue(texts.stream().noneMatch(t -> t.contains("180.000")));
        String rendered = WhatsAppChatParser.renderForModel(parsed, parsed.messages());
        assertTrue(rendered.contains("PROSPECTO"));
        assertTrue(rendered.contains("ASESOR"));
    }
}
