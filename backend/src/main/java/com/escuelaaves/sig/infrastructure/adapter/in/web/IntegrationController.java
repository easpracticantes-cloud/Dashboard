package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.integration.IntegrationStatusDto;
import com.escuelaaves.sig.application.dto.integration.SheetsSyncResultDto;
import com.escuelaaves.sig.application.service.IntegrationStatusService;
import com.escuelaaves.sig.application.service.SheetsSyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/integrations")
@RequiredArgsConstructor
@Tag(name = "Integraciones", description = "Estado de las integraciones externas (WhatsApp, Google, IA, etc.)")
public class IntegrationController {

    private final IntegrationStatusService integrationStatusService;
    private final SheetsSyncService sheetsSyncService;

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
}
