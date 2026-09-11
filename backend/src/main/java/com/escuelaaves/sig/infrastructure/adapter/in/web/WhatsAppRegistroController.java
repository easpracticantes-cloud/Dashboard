package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.registro.whatsapp.WhatsAppRegistroService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/registro/whatsapp")
@RequiredArgsConstructor
@Tag(name = "Registro WhatsApp", description = "Importa chats exportados hacia el Excel de Registro existente")
public class WhatsAppRegistroController {

    private final WhatsAppRegistroService whatsAppRegistroService;

    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Analiza hasta 50 chats (.txt o .zip). El ZIP se descomprime y se omiten fotos/audios.")
    public ResponseEntity<Map<String, Object>> analyze(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "files", required = false) MultipartFile[] files
    ) {
        List<MultipartFile> all = new ArrayList<>();
        if (file != null && !file.isEmpty()) {
            all.add(file);
        }
        if (files != null) {
            for (MultipartFile part : files) {
                if (part != null && !part.isEmpty()) {
                    all.add(part);
                }
            }
        }
        return ResponseEntity.ok(whatsAppRegistroService.analyze(all));
    }

    @PostMapping("/confirm-batch")
    @Operation(summary = "Confirma varios previews y escribe el Excel de Registro")
    public ResponseEntity<Map<String, Object>> confirmBatch(@RequestBody Map<String, Object> body) {
        if (body == null || !(body.get("items") instanceof List<?> raw)) {
            throw new com.escuelaaves.sig.shared.exception.BadRequestException("items es obligatorio");
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = raw.stream()
                .filter(Map.class::isInstance)
                .map(v -> (Map<String, Object>) v)
                .toList();
        return ResponseEntity.ok(whatsAppRegistroService.confirmBatch(items));
    }

    @PostMapping("/confirm")
    @Operation(summary = "Confirma el preview y escribe/actualiza el Excel de Registro")
    public ResponseEntity<Map<String, Object>> confirm(@RequestBody Map<String, Object> body) {
        if (body == null || body.get("previewId") == null) {
            throw new com.escuelaaves.sig.shared.exception.BadRequestException("previewId es obligatorio");
        }
        UUID previewId = UUID.fromString(String.valueOf(body.get("previewId")));
        boolean updateExisting = Boolean.TRUE.equals(body.get("updateExisting"));
        @SuppressWarnings("unchecked")
        Map<String, Object> row = body.get("row") instanceof Map<?, ?> m
                ? (Map<String, Object>) m
                : Map.of();
        return ResponseEntity.ok(whatsAppRegistroService.confirm(previewId, row, updateExisting));
    }

    @PostMapping("/{previewId}/cancel")
    @Operation(summary = "Descarta un preview sin tocar el Excel")
    public ResponseEntity<Void> cancel(@PathVariable UUID previewId) {
        whatsAppRegistroService.cancel(previewId);
        return ResponseEntity.noContent().build();
    }
}
