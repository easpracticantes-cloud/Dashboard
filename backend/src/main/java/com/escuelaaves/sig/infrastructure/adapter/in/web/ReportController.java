package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.report.ReportSummaryDto;
import com.escuelaaves.sig.domain.port.in.ReportUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
@Tag(name = "Reportes", description = "Reportes y exportaciones de conversaciones")
public class ReportController {

    private final ReportUseCase reportUseCase;

    @GetMapping("/conversations")
    @Operation(summary = "Obtiene el resumen del reporte de conversaciones")
    public ResponseEntity<ReportSummaryDto> conversationsReport() {
        return ResponseEntity.ok(reportUseCase.getConversationsReport());
    }

    @GetMapping("/conversations/export/csv")
    @Operation(summary = "Exporta el reporte de conversaciones en formato CSV")
    public ResponseEntity<byte[]> exportCsv() {
        byte[] content = reportUseCase.exportConversationsCsv();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"reporte-conversaciones.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(content);
    }

    @GetMapping("/conversations/export/pdf")
    @Operation(summary = "Exporta el reporte de conversaciones en formato PDF (stub)")
    public ResponseEntity<byte[]> exportPdf() {
        byte[] content = reportUseCase.exportConversationsPdf();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"reporte-conversaciones.pdf\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(content);
    }
}
