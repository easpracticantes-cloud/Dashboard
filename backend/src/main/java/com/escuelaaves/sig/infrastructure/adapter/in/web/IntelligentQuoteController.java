package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.ai.IntelligentQuoteOrchestrator;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.ApproveIntelligentQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.ApproveIntelligentQuoteResponse;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.CreateIntelligentQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.IntelligentQuoteResponse;
import com.escuelaaves.sig.application.dto.ai.IntelligentQuoteDtos.RecalculateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Cotizaciones inteligentes. Independiente de WhatsApp / Registro.
 */
@RestController
@RequestMapping("/api/v1/ai/intelligent-quotes")
@RequiredArgsConstructor
@Tag(name = "Cotizaciones inteligentes", description = "Cliente SIG + instrucción asesor + Claude + catálogo")
public class IntelligentQuoteController {

    private final IntelligentQuoteOrchestrator orchestrator;

    @PostMapping
    @Operation(summary = "Crear borrador inteligente a partir de instrucción del asesor")
    public ResponseEntity<IntelligentQuoteResponse> create(@RequestBody CreateIntelligentQuoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(orchestrator.create(request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener borrador inteligente")
    public ResponseEntity<IntelligentQuoteResponse> get(@PathVariable UUID id) {
        return ResponseEntity.ok(orchestrator.get(id));
    }

    @PostMapping("/{id}/recalculate")
    @Operation(summary = "Recalcular totales tras edición manual")
    public ResponseEntity<IntelligentQuoteResponse> recalculate(
            @PathVariable UUID id,
            @RequestBody RecalculateRequest body) {
        QuoteDraftDto document = body != null ? body.document() : null;
        return ResponseEntity.ok(orchestrator.recalculate(id, document));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Guardar cotización comercial en SIG")
    public ResponseEntity<ApproveIntelligentQuoteResponse> approve(
            @PathVariable UUID id,
            @RequestBody(required = false) ApproveIntelligentQuoteRequest body) {
        return ResponseEntity.ok(orchestrator.approve(id, body));
    }
}
