package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.integration.IntegrationStatusDto;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteRequest;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteResultDto;
import com.escuelaaves.sig.application.dto.integration.SheetsSyncResultDto;
import com.escuelaaves.sig.application.service.IntegrationStatusService;
import com.escuelaaves.sig.application.service.SheetsSyncService;
import com.escuelaaves.sig.application.service.SheetsWriteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/integrations")
@RequiredArgsConstructor
@Tag(name = "Integraciones", description = "Estado de las integraciones externas (WhatsApp, Google, IA, etc.)")
public class IntegrationController {

    private final IntegrationStatusService integrationStatusService;
    private final SheetsSyncService sheetsSyncService;
    private final SheetsWriteService sheetsWriteService;

    @GetMapping("/status")
    @Operation(summary = "Lista el estado de todas las integraciones externas configuradas")
    public ResponseEntity<List<IntegrationStatusDto>> status() {
        return ResponseEntity.ok(integrationStatusService.getStatuses());
    }

    @PostMapping("/sheets/sync")
    @Operation(summary = "Sincroniza conversaciones y clientes desde Google Sheets (CRM en background)")
    public ResponseEntity<SheetsSyncResultDto> syncSheets() {
        // Async: Render corta HTTP ~30s; el payload Sheets + ~1000 filas CRM supera ese limite.
        return ResponseEntity.accepted().body(sheetsSyncService.syncNowAsync());
    }

    @PostMapping("/sheets/rows")
    @Operation(summary = "Escribe una fila genérica en Google Sheets (updateRow / appendRow)")
    public ResponseEntity<SheetRowWriteResultDto> writeSheetRow(@Valid @RequestBody SheetRowWriteRequest request) {
        return ResponseEntity.ok(sheetsWriteService.write(request));
    }

    @PutMapping("/sheets/seguimiento")
    @Operation(summary = "Actualiza un seguimiento en Google Sheets y en el cache del dashboard")
    public ResponseEntity<SheetRowWriteResultDto> updateSeguimiento(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(sheetsWriteService.updateSeguimiento(body));
    }

    @PostMapping("/sheets/seguimiento")
    @Operation(summary = "Agrega una fila de seguimiento al Excel (Google Sheets)")
    public ResponseEntity<SheetRowWriteResultDto> appendSeguimiento(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(sheetsWriteService.appendSeguimiento(body));
    }

    @PutMapping("/sheets/venta")
    @Operation(summary = "Actualiza una venta tipada en Google Sheets y en el cache del dashboard")
    public ResponseEntity<SheetRowWriteResultDto> updateVenta(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(sheetsWriteService.updateVenta(body));
    }
}
