package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.ai.VoiceTtsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/ai/voice")
@RequiredArgsConstructor
@Tag(name = "IA Voice", description = "Síntesis de voz premium (no es el cerebro de Ave)")
public class VoiceTtsController {

    private final VoiceTtsService voiceTtsService;

    @GetMapping("/status")
    @Operation(summary = "Estado de la voz premium (sin secretos)")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(voiceTtsService.status());
    }

    @PostMapping(value = "/tts/stream")
    @Operation(summary = "Sintetiza texto de Ave a audio streaming")
    public ResponseEntity<StreamingResponseBody> stream(@RequestBody Map<String, String> body) {
        String text = body == null ? "" : body.getOrDefault("text", "");
        StreamingResponseBody stream = output -> voiceTtsService.stream(text, output);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Accel-Buffering", "no")
                .contentType(MediaType.parseMediaType(voiceTtsService.mediaType()))
                .body(stream);
    }
}
