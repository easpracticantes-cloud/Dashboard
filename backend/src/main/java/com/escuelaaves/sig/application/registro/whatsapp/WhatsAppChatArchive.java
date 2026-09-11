package com.escuelaaves.sig.application.registro.whatsapp;

import com.escuelaaves.sig.shared.exception.BadRequestException;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Descomprime exportaciones de WhatsApp (.txt / .zip, zips anidados a un nivel)
 * y deja solo los chats de texto. Omite fotos, audios y demás adjuntos.
 */
public final class WhatsAppChatArchive {

    public static final int MAX_CHATS = 50;
    static final long MAX_UPLOAD_BYTES = 80L * 1024 * 1024;
    static final int MAX_TXT_BYTES = 8 * 1024 * 1024;
    static final int MAX_ZIP_ENTRIES = 4000;
    static final int MAX_NESTED_ZIP_BYTES = 40 * 1024 * 1024;

    private WhatsAppChatArchive() {
    }

    public record ExtractedChat(String filename, String text, String sourceKind) {
    }

    public static List<ExtractedChat> collect(List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            throw new BadRequestException("Seleccione chats exportados de WhatsApp (.txt o .zip). Máximo "
                    + MAX_CHATS + ".");
        }
        long totalUpload = 0;
        List<ExtractedChat> chats = new ArrayList<>();
        Map<String, ExtractedChat> byHash = new LinkedHashMap<>();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                continue;
            }
            totalUpload += file.getSize();
            if (totalUpload > MAX_UPLOAD_BYTES) {
                throw new BadRequestException("El lote supera 80 MB. Divida los ZIP o quite adjuntos de media.");
            }
            String filename = safeName(file.getOriginalFilename());
            String lower = filename.toLowerCase(Locale.ROOT);
            try {
                if (lower.endsWith(".txt")) {
                    addChat(byHash, chats, filename, new String(file.getBytes(), StandardCharsets.UTF_8), "txt");
                } else if (lower.endsWith(".zip")) {
                    explodeZip(file.getInputStream(), filename, byHash, chats, 0);
                } else {
                    throw new BadRequestException(
                            "Formato no soportado: " + filename + ". Use .txt o .zip exportados por WhatsApp.");
                }
            } catch (BadRequestException ex) {
                throw ex;
            } catch (Exception ex) {
                throw new BadRequestException("No se pudo leer " + filename + ".");
            }
            if (chats.size() > MAX_CHATS) {
                throw new BadRequestException("Hay más de " + MAX_CHATS + " chats. Divida el lote.");
            }
        }
        if (chats.isEmpty()) {
            throw new BadRequestException("No se encontró ningún chat de WhatsApp (.txt) en los archivos.");
        }
        return List.copyOf(chats);
    }

    static void explodeZip(
            InputStream in,
            String zipName,
            Map<String, ExtractedChat> byHash,
            List<ExtractedChat> chats,
            int depth
    ) throws IOException {
        int entries = 0;
        try (ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries++;
                if (entries > MAX_ZIP_ENTRIES) {
                    throw new BadRequestException("El ZIP " + zipName + " tiene demasiadas entradas.");
                }
                if (entry.isDirectory()) {
                    continue;
                }
                String name = safeName(entry.getName()).toLowerCase(Locale.ROOT);
                if (name.endsWith(".txt")) {
                    byte[] raw = readLimited(zip, MAX_TXT_BYTES, name);
                    addChat(byHash, chats, safeName(entry.getName()), new String(raw, StandardCharsets.UTF_8), "zip");
                } else if (name.endsWith(".zip") && depth < 1) {
                    byte[] nested = readLimited(zip, MAX_NESTED_ZIP_BYTES, name);
                    explodeZip(new ByteArrayInputStream(nested), safeName(entry.getName()), byHash, chats, depth + 1);
                }
                if (chats.size() > MAX_CHATS) {
                    throw new BadRequestException("El ZIP contiene más de " + MAX_CHATS + " chats. Divida el archivo.");
                }
            }
        }
    }

    private static void addChat(
            Map<String, ExtractedChat> byHash,
            List<ExtractedChat> chats,
            String filename,
            String text,
            String sourceKind
    ) {
        if (text == null || text.isBlank()) {
            return;
        }
        var parsed = WhatsAppChatParser.parse(filename, text);
        boolean looksLikeWhatsapp = parsed.messages().stream().anyMatch(m ->
                m.at() != null
                        || (m.sender() != null && !m.sender().isBlank() && !"sistema".equalsIgnoreCase(m.sender())));
        if (!looksLikeWhatsapp) {
            return;
        }
        String key = Integer.toHexString(text.hashCode()) + ":" + parsed.messages().size();
        if (byHash.containsKey(key)) {
            return;
        }
        ExtractedChat chat = new ExtractedChat(filename, text, sourceKind);
        byHash.put(key, chat);
        chats.add(chat);
    }

    private static byte[] readLimited(InputStream in, int max, String name) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        int total = 0;
        while ((n = in.read(chunk)) >= 0) {
            total += n;
            if (total > max) {
                throw new BadRequestException("El archivo " + name + " supera el tamaño permitido.");
            }
            buf.write(chunk, 0, n);
        }
        return buf.toByteArray();
    }

    static String safeName(String filename) {
        if (filename == null || filename.isBlank()) {
            return "chat.txt";
        }
        String normalized = filename.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String base = slash >= 0 ? normalized.substring(slash + 1) : normalized;
        return base.isBlank() ? "chat.txt" : base;
    }
}
