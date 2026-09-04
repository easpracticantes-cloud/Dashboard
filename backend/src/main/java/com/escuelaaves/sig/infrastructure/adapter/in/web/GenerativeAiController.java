package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.ai.IntelligenceService;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ActionExecuteRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ActionExecuteResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ActionStepDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChecklistResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.DashboardSummaryRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.DashboardSummaryResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ProviderRecommendationDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ProviderRecommendationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;
import com.escuelaaves.sig.domain.port.in.AIUseCase;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * Controlador HTTP del Enterprise AI Engine.
 * Sin lógica de negocio: delega en {@link AIUseCase} / {@link IntelligenceService}.
 * Nombre distinto de {@link AiController} (asistente CRM) por Windows case-insensitive FS.
 */
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "IA Enterprise", description = "Chat, cotizador, checklist y asistentes multi-proveedor")
public class GenerativeAiController {

    private final AIUseCase aiUseCase;
    private final IntelligenceService intelligenceService;

    @PostMapping("/chat")
    @Operation(summary = "Chat libre con el proveedor IA activo")
    public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        return ResponseEntity.ok(aiUseCase.chat(request));
    }

    @PostMapping("/quotation")
    @Operation(summary = "Cotización enterprise: IA interpreta → reglas → precios PG → checklist → narrativa")
    public ResponseEntity<QuotationResponse> quotation(@Valid @RequestBody QuotationRequest request) {
        return ResponseEntity.ok(aiUseCase.quotation(request));
    }

    @PostMapping("/interpret-quote")
    @Operation(summary = "Solo interpretación estructurada (sin precios)")
    public ResponseEntity<QuoteInterpretation> interpretQuote(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiUseCase.interpretQuote(required(body, "message")));
    }

    @PostMapping("/interpret-quotation")
    @Operation(summary = "Alias de interpret-quote")
    public ResponseEntity<QuoteInterpretation> interpretQuotation(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiUseCase.interpretQuote(required(body, "message")));
    }

    @PostMapping("/summarize")
    @Operation(summary = "Resume una conversación")
    public ResponseEntity<Map<String, String>> summarize(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(Map.of("summary", aiUseCase.summarizeConversation(required(body, "text"))));
    }

    @PostMapping("/classify")
    @Operation(summary = "Clasifica una conversación")
    public ResponseEntity<ConversationClassification> classify(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiUseCase.classifyConversation(required(body, "text")));
    }

    @PostMapping("/generate-email")
    @Operation(summary = "Genera un correo profesional")
    public ResponseEntity<Map<String, String>> generateEmail(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(Map.of("email", aiUseCase.generateEmail(required(body, "context"))));
    }

    @PostMapping("/extract-reservation")
    @Operation(summary = "Extrae datos de reserva desde texto libre")
    public ResponseEntity<ReservationExtraction> extractReservation(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiUseCase.extractReservationInformation(required(body, "message")));
    }

    @PostMapping("/detect-language")
    @Operation(summary = "Detecta idioma del texto")
    public ResponseEntity<LanguageDetection> detectLanguage(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiUseCase.detectLanguage(required(body, "text")));
    }

    @PostMapping("/analyze-sentiment")
    @Operation(summary = "Analiza sentimiento")
    public ResponseEntity<SentimentAnalysis> analyzeSentiment(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiUseCase.analyzeSentiment(required(body, "text")));
    }

    @PostMapping("/suggest-reply")
    @Operation(summary = "Sugiere respuesta de WhatsApp/CRM")
    public ResponseEntity<Map<String, String>> suggestReply(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(Map.of("reply", aiUseCase.suggestReply(required(body, "text"))));
    }

    @PostMapping("/dashboard-summary")
    @Operation(summary = "Resumen ejecutivo para dashboard operativo")
    public ResponseEntity<DashboardSummaryResponse> dashboardSummary(
            @RequestBody(required = false) DashboardSummaryRequest request) {
        return ResponseEntity.ok(intelligenceService.dashboardSummary(
                request != null ? request : new DashboardSummaryRequest("")));
    }

    @PostMapping("/provider-recommendation")
    @Operation(summary = "Recomendación de proveedores/guías/transporte")
    public ResponseEntity<List<ProviderRecommendationDto>> providerRecommendation(
            @RequestBody(required = false) ProviderRecommendationRequest request) {
        String tour = request != null ? request.tourCode() : null;
        String category = request != null ? request.category() : null;
        return ResponseEntity.ok(intelligenceService.providerRecommendation(tour, category));
    }

    @PostMapping("/checklist")
    @Operation(summary = "Checklist operativa por tour")
    public ResponseEntity<ChecklistResponse> checklist(@RequestBody Map<String, String> body) {
        String tour = body != null && body.get("tourCode") != null ? body.get("tourCode") : body != null ? body.get("tour") : null;
        if (tour == null || tour.isBlank()) {
            throw new BadRequestException("Campo requerido: tourCode");
        }
        return ResponseEntity.ok(intelligenceService.checklist(tour));
    }

    @GetMapping("/status")
    @Operation(summary = "Estado del proveedor IA activo")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(intelligenceService.providerStatus());
    }

    @GetMapping("/usage-logs")
    @Operation(summary = "Últimos registros de uso IA (observabilidad)")
    public ResponseEntity<List<Map<String, Object>>> usageLogs() {
        return ResponseEntity.ok(intelligenceService.recentUsage());
    }

    @PostMapping("/insights")
    @Operation(summary = "Insights analíticos con IA")
    public ResponseEntity<?> insights(@RequestBody(required = false) Map<String, String> body) {
        String context = body != null ? body.getOrDefault("context", "") : "";
        return ResponseEntity.ok(intelligenceService.insights(context));
    }

    @PostMapping("/whatsapp/auto-reply")
    @Operation(summary = "Borrador de auto-respuesta WhatsApp + prioridad")
    public ResponseEntity<Map<String, String>> whatsappAutoReply(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(intelligenceService.whatsappAutoReply(required(body, "text")));
    }

    @PostMapping("/actions/execute")
    @Operation(summary = "Asistente operativo: interpreta instrucción y ejecuta tools del CRM (dryRun por defecto)")
    public ResponseEntity<ActionExecuteResponse> executeActions(@Valid @RequestBody ActionExecuteRequest request) {
        var outcome = intelligenceService.executeActions(
                request.instruction(),
                request.contextJson(),
                request.dryRunOrDefault(),
                request.confirmOrFalse()
        );
        return ResponseEntity.ok(new ActionExecuteResponse(
                outcome.rationale(),
                outcome.results().stream()
                        .map(r -> new ActionStepDto(r.tool(), r.success(), r.skipped(), r.dryRun(), r.message(), r.data()))
                        .toList(),
                outcome.narrative(),
                outcome.executed(),
                outcome.dryRun(),
                outcome.plan().stream().map(p -> p.tool().name()).toList()
        ));
    }

    @PostMapping("/copilot")
    @Operation(summary = "Ave — asistente conversacional de texto libre (cotización vía catálogo cuando aplique)")
    public ResponseEntity<CopilotResponse> copilot(@Valid @RequestBody CopilotRequest request) {
        return ResponseEntity.ok(intelligenceService.copilot(request));
    }

    @PostMapping(value = "/copilot/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Ave — misma lógica que /copilot con revelado progresivo (SSE)")
    public SseEmitter copilotStream(@Valid @RequestBody CopilotRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L);
        java.util.concurrent.Executors.newSingleThreadExecutor().execute(() -> {
            try {
                intelligenceService.copilotStream(
                        request,
                        delta -> {
                            try {
                                emitter.send(SseEmitter.event().name("delta").data(delta));
                            } catch (Exception ex) {
                                throw new RuntimeException(ex);
                            }
                        },
                        done -> {
                            try {
                                emitter.send(SseEmitter.event().name("done").data(done));
                                emitter.complete();
                            } catch (Exception ex) {
                                emitter.completeWithError(ex);
                            }
                        }
                );
            } catch (Exception ex) {
                try {
                    emitter.send(SseEmitter.event().name("error")
                            .data(Map.of("message",
                                    "Hubo un problema temporal con el asistente. Inténtalo nuevamente en un momento.")));
                } catch (Exception ignored) {
                    // ignore
                }
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }

    @PostMapping("/memory/sessions")
    @Operation(summary = "Inicia sesión de memoria conversacional")
    public ResponseEntity<Map<String, String>> startMemory(@RequestBody(required = false) Map<String, String> body) {
        String title = body != null ? body.getOrDefault("title", "Sesión IA") : "Sesión IA";
        return ResponseEntity.ok(Map.of("sessionId", intelligenceService.startMemorySession(null, title)));
    }

    @PostMapping("/memory/{sessionId}/messages")
    @Operation(summary = "Agrega mensaje a memoria")
    public ResponseEntity<Void> appendMemory(
            @org.springframework.web.bind.annotation.PathVariable String sessionId,
            @RequestBody Map<String, String> body) {
        intelligenceService.appendMemory(sessionId,
                body.getOrDefault("role", "user"),
                required(body, "content"));
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/memory/{sessionId}/messages")
    @Operation(summary = "Lee mensajes recientes de memoria")
    public ResponseEntity<?> memoryMessages(
            @org.springframework.web.bind.annotation.PathVariable String sessionId) {
        return ResponseEntity.ok(intelligenceService.memoryMessages(sessionId, 40));
    }

    private static String required(Map<String, String> body, String key) {
        if (body == null || body.get(key) == null || body.get(key).isBlank()) {
            throw new BadRequestException("Campo requerido: " + key);
        }
        return body.get(key);
    }
}
