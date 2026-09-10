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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/registro/whatsapp")
@RequiredArgsConstructor
@Tag(name = "Registro WhatsApp", description = "Importa chats exportados hacia el Excel de Registro existente")
public class WhatsAppRegistroController {

    private final WhatsAppRegistroService whatsAppRegistroService;

    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Analiza un chat exportado y devuelve preview (no escribe el Excel)")
    public ResponseEntity<Map<String, Object>> analyze(@RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok(whatsAppRegistroService.analyze(file));
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
