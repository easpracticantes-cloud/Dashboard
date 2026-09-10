package com.escuelaaves.sig.application.registro.whatsapp;

import com.escuelaaves.sig.application.ai.IntelligenceService;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SeguimientoWhatsappDto;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteResultDto;
import com.escuelaaves.sig.application.service.SheetsSyncService;
import com.escuelaaves.sig.application.service.SheetsWriteService;
import com.escuelaaves.sig.domain.ai.model.SeguimientoExtraction;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.WhatsAppImportAuditEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.WhatsAppImportAuditJpaRepository;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
@Slf4j
public class WhatsAppRegistroService {

    private static final int MAX_MESSAGES_FOR_MODEL = 220;
    private static final long MAX_BYTES = 8 * 1024 * 1024;

    private final IntelligenceService intelligenceService;
    private final SheetsSyncService sheetsSyncService;
    private final SheetsWriteService sheetsWriteService;
    private final WhatsAppImportAuditJpaRepository auditRepository;
    private final ObjectMapper objectMapper;

    public Map<String, Object> analyze(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Seleccione un chat exportado de WhatsApp (.txt o .zip).");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("El archivo supera 8 MB.");
        }
        String filename = file.getOriginalFilename() == null ? "chat.txt" : file.getOriginalFilename();
        String lower = filename.toLowerCase(Locale.ROOT);
        if (!(lower.endsWith(".txt") || lower.endsWith(".zip"))) {
            throw new BadRequestException("Formato no soportado. Use un .txt o .zip exportado por WhatsApp.");
        }
        try {
            String raw = lower.endsWith(".zip") ? readZipChat(file) : new String(file.getBytes(), StandardCharsets.UTF_8);
            WhatsAppChatParser.ParsedWhatsAppChat parsed = WhatsAppChatParser.parse(filename, raw);
            if (parsed.messages().isEmpty()) {
                throw new BadRequestException("No se reconocieron mensajes en el archivo.");
            }
            List<WhatsAppChatParser.WhatsAppMessage> compact =
                    WhatsAppChatParser.compactForModel(parsed.messages(), MAX_MESSAGES_FOR_MODEL);
            String rendered = WhatsAppChatParser.renderForModel(compact);
            SeguimientoExtraction extraction = intelligenceService.extractSeguimientoFromChat(rendered);
            if (parsed.inferredPhone() != null && blank(extraction.valor("celular"))) {
                extraction.campos().put(
                        "celular",
                        SeguimientoExtraction.FieldValue.of(parsed.inferredPhone(), "INFERIDO", 0.7)
                );
            }
            List<Map<String, Object>> matches = findPossibleDuplicates(extraction);
            String json = objectMapper.writeValueAsString(extraction);
            WhatsAppImportAuditEntity saved = auditRepository.save(WhatsAppImportAuditEntity.builder()
                    .filename(safeName(filename))
                    .fileHash(sha256(file.getBytes()))
                    .sourceKind(lower.endsWith(".zip") ? "zip" : "txt")
                    .messageCount(parsed.messages().size())
                    .model("claude")
                    .extractedJson(json)
                    .status("PREVIEW")
                    .build());
            log.info("[WhatsAppRegistro] analizado fileHash={} mensajes={} previewId={}",
                    saved.getFileHash(), parsed.messages().size(), saved.getId());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("previewId", saved.getId().toString());
            out.put("filename", saved.getFilename());
            out.put("messageCount", parsed.messages().size());
            out.put("campos", extraction.campos());
            out.put("ultimaCotizacion", extraction.ultimaCotizacion());
            out.put("historialCotizaciones", extraction.historialCotizaciones());
            out.put("resumen", extraction.resumen());
            out.put("posibleDuplicado", matches.isEmpty() ? extraction.posibleDuplicado() : "REVISAR POSIBLE DUPLICADO");
            out.put("coincidencias", matches);
            out.put("requiereConfirmacion", true);
            return out;
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("[WhatsAppRegistro] análisis falló tipo={} size={}", extOf(filename), file.getSize());
            throw new BadRequestException("No se pudo analizar el chat de WhatsApp.");
        }
    }

    public Map<String, Object> confirm(UUID previewId, Map<String, Object> editedRow, boolean updateExisting) {
        WhatsAppImportAuditEntity audit = auditRepository.findById(previewId)
                .orElseThrow(() -> new BadRequestException("No hay un análisis pendiente con ese id."));
        if (!"PREVIEW".equals(audit.getStatus())) {
            throw new BadRequestException("Este análisis ya fue confirmado o cancelado.");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        if (editedRow != null) {
            body.putAll(editedRow);
        }
        body.putIfAbsent("canal", "WHATSAPP");
        body.putIfAbsent("registrado", "WHATSAPP");
        SheetRowWriteResultDto result;
        if (updateExisting) {
            result = sheetsWriteService.updateSeguimiento(body);
        } else {
            result = sheetsWriteService.appendSeguimiento(body);
        }
        audit.setStatus("CONFIRMED");
        audit.setConfirmedBy(currentUsername());
        audit.setConfirmedAt(Instant.now());
        auditRepository.save(audit);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", result.success());
        out.put("message", result.message());
        out.put("previewId", previewId.toString());
        return out;
    }

    public void cancel(UUID previewId) {
        WhatsAppImportAuditEntity audit = auditRepository.findById(previewId)
                .orElseThrow(() -> new BadRequestException("No hay un análisis pendiente con ese id."));
        if ("PREVIEW".equals(audit.getStatus())) {
            audit.setStatus("CANCELLED");
            auditRepository.save(audit);
        }
    }

    private List<Map<String, Object>> findPossibleDuplicates(SeguimientoExtraction extraction) {
        List<Map<String, Object>> hits = new ArrayList<>();
        String phone = digits(extraction.valor("celular"));
        String cliente = nullToEmpty(extraction.valor("cliente")).toLowerCase(Locale.ROOT);
        var dashboard = sheetsSyncService.getDashboardSheets(false);
        if (dashboard == null || dashboard.seguimientoWhatsapp() == null) {
            return hits;
        }
        for (SeguimientoWhatsappDto row : dashboard.seguimientoWhatsapp()) {
            String rowPhone = digits(row.celular());
            boolean phoneHit = phone.length() >= 7 && rowPhone.length() >= 7
                    && (rowPhone.endsWith(phone) || phone.endsWith(rowPhone));
            boolean nameHit = cliente.length() >= 4
                    && nullToEmpty(row.cliente()).toLowerCase(Locale.ROOT).contains(cliente);
            if (!phoneHit && !nameHit) {
                continue;
            }
            Map<String, Object> hit = new LinkedHashMap<>();
            hit.put("cliente", row.cliente());
            hit.put("celular", row.celular());
            hit.put("fecha", row.fecha());
            hit.put("hojaOrigen", row.hojaOrigen());
            hit.put("fechaCotizado", row.fechaCotizado());
            hit.put("pendiente", row.pendiente());
            hit.put("motivo", phoneHit && nameHit ? "celular_y_nombre" : phoneHit ? "celular" : "nombre");
            hits.add(hit);
            if (hits.size() >= 5) {
                break;
            }
        }
        return hits;
    }

    private String readZipChat(MultipartFile file) throws Exception {
        try (ZipInputStream zip = new ZipInputStream(file.getInputStream())) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName().toLowerCase(Locale.ROOT);
                if (entry.isDirectory() || !name.endsWith(".txt")) {
                    continue;
                }
                if (name.contains("chat") || name.endsWith(".txt")) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    zip.transferTo(buf);
                    return buf.toString(StandardCharsets.UTF_8);
                }
            }
        }
        throw new BadRequestException("El ZIP no contiene un chat de WhatsApp (.txt).");
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? "anonimo" : auth.getName();
    }

    private static String sha256(byte[] data) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        return HexFormat.of().formatHex(digest);
    }

    private static String safeName(String filename) {
        int slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
        return slash >= 0 ? filename.substring(slash + 1) : filename;
    }

    private static String extOf(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot + 1) : "";
    }

    private static boolean blank(String v) {
        return v == null || v.isBlank();
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
