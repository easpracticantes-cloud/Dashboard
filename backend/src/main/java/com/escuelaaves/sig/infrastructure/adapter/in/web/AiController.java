package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.ConversationSummary;
import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.ReplySuggestion;
import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.SentimentInsight;
import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.GenerateQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.QuoteSuggestion;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.domain.port.in.AiAssistUseCase;
import com.escuelaaves.sig.domain.port.in.AiQuoteUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "Asistente IA", description = "Cotizaciones automáticas a partir de conversaciones")
public class AiController {

    private final AiQuoteUseCase aiQuoteUseCase;
    private final AiAssistUseCase aiAssistUseCase;

    @GetMapping("/conversations/{conversationId}/quote-suggestion")
    @Operation(summary = "Analiza el chat y sugiere si generar una cotización, con un borrador editable")
    public ResponseEntity<QuoteSuggestion> quoteSuggestion(@PathVariable UUID conversationId) {
        return ResponseEntity.ok(aiQuoteUseCase.suggestForConversation(conversationId));
    }

    @PostMapping("/conversations/{conversationId}/quote")
    @Operation(summary = "Genera y guarda la cotización analizando el chat (con ajustes opcionales)")
    public ResponseEntity<QuoteDto> generateQuote(
            @PathVariable UUID conversationId,
            @RequestBody(required = false) GenerateQuoteRequest overrides) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(aiQuoteUseCase.generateForConversation(conversationId, overrides));
    }

    @GetMapping("/conversations/{conversationId}/reply-suggestion")
    @Operation(summary = "Sugiere una respuesta de WhatsApp analizando el chat")
    public ResponseEntity<ReplySuggestion> replySuggestion(@PathVariable UUID conversationId) {
        return ResponseEntity.ok(aiAssistUseCase.suggestReply(conversationId));
    }

    @GetMapping("/conversations/{conversationId}/summary")
    @Operation(summary = "Resume la conversación con puntos clave y siguiente paso")
    public ResponseEntity<ConversationSummary> summary(@PathVariable UUID conversationId) {
        return ResponseEntity.ok(aiAssistUseCase.summarize(conversationId));
    }

    @GetMapping("/conversations/{conversationId}/sentiment")
    @Operation(summary = "Analiza sentimiento, intención y urgencia de la conversación")
    public ResponseEntity<SentimentInsight> sentiment(@PathVariable UUID conversationId) {
        return ResponseEntity.ok(aiAssistUseCase.analyzeSentiment(conversationId));
    }

    @GetMapping("/quotes/{quoteId}/pdf")
    @Operation(summary = "Descarga la cotización en PDF")
    public ResponseEntity<byte[]> quotePdf(@PathVariable UUID quoteId) {
        byte[] pdf = aiQuoteUseCase.exportQuotePdf(quoteId);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename("cotizacion-" + quoteId + ".pdf")
                .build());
        return ResponseEntity.ok().headers(headers).body(pdf);
    }
}
