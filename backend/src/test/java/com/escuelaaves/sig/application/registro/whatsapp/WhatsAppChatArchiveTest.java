package com.escuelaaves.sig.application.registro.whatsapp;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WhatsAppChatArchiveTest {

    private static final String CHAT_A = """
            12/8/2026, 10:00 - Juan: Hola quiero Salento
            12/8/2026, 10:05 - Andrea: Vale 180.000
            """;
    private static final String CHAT_B = """
            [12/8/26, 11:00:00] María: Rafting 4 pax
            [12/8/26, 11:05:00] Andrea: 250.000 pp
            """;

    @Test
    void extraeVariosTxtDeUnZipYOmiteMedia() throws Exception {
        byte[] zip = zipOf(
                "_chat.txt", CHAT_A,
                "IMG-0001.jpg", "not-a-chat",
                "WhatsApp Chat with Maria.txt", CHAT_B
        );
        var file = new MockMultipartFile("files", "export.zip", "application/zip", zip);
        var chats = WhatsAppChatArchive.collect(List.of(file));
        assertEquals(2, chats.size());
    }

    @Test
    void extraeZipAnidado() throws Exception {
        byte[] inner = zipOf("_chat.txt", CHAT_A);
        ByteArrayOutputStream outer = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(outer)) {
            z.putNextEntry(new ZipEntry("cliente/export.zip"));
            z.write(inner);
            z.closeEntry();
        }
        var file = new MockMultipartFile("files", "lote.zip", "application/zip", outer.toByteArray());
        assertEquals(1, WhatsAppChatArchive.collect(List.of(file)).size());
    }

    @Test
    void rechazaMasDe50Chats() throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(buf)) {
            for (int i = 1; i <= 51; i++) {
                z.putNextEntry(new ZipEntry("chat-" + i + ".txt"));
                z.write(("1/1/2026, 10:00 - C" + i + ": hola " + i + "\n").getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
        }
        var file = new MockMultipartFile("files", "muchos.zip", "application/zip", buf.toByteArray());
        var ex = assertThrows(RuntimeException.class, () -> WhatsAppChatArchive.collect(List.of(file)));
        assertTrue(ex.getMessage().toLowerCase().contains("50"));
    }

    @Test
    void ignoraTxtSinMensajesDeWhatsapp() throws Exception {
        var txt = new MockMultipartFile("files", "notas.txt", "text/plain", "solo un memo".getBytes(StandardCharsets.UTF_8));
        var chat = new MockMultipartFile("files", "chat.txt", "text/plain", CHAT_A.getBytes(StandardCharsets.UTF_8));
        assertEquals(1, WhatsAppChatArchive.collect(List.of(txt, chat)).size());
    }

    private static byte[] zipOf(String... namesAndBodies) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(buf)) {
            for (int i = 0; i < namesAndBodies.length; i += 2) {
                z.putNextEntry(new ZipEntry(namesAndBodies[i]));
                z.write(namesAndBodies[i + 1].getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
        }
        return buf.toByteArray();
    }
}
