package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.infrastructure.ai.config.VoiceTtsProperties;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Capa de voz premium. No interpreta ni razona: solo sintetiza texto ya generado por Ave.
 */
@Slf4j
@Service
public class VoiceTtsService {

    private final VoiceTtsProperties properties;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public VoiceTtsService(
            VoiceTtsProperties properties,
            @Qualifier("voiceHttpClient") HttpClient httpClient,
            ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    public String mediaType() {
        return properties.mediaType();
    }

    public Map<String, Object> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", properties.enabled());
        out.put("provider", properties.enabled() ? properties.provider() : "browser");
        out.put("model", properties.enabled() ? properties.model() : "speechSynthesis");
        out.put("format", properties.enabled() ? properties.outputFormat() : "speechSynthesis");
        out.put("sampleRate", properties.enabled() ? properties.pcmSampleRate() : 0);
        return out;
    }

    public void stream(String rawText, OutputStream output) {
        if (!properties.enabled()) {
            throw new BadRequestException("La voz premium no está configurada.");
        }
        String text = rawText == null ? "" : rawText.trim();
        if (text.isBlank()) {
            throw new BadRequestException("No hay texto para sintetizar.");
        }
        if (text.length() > 4500) {
            text = text.substring(0, 4500) + "…";
        }
        long start = System.currentTimeMillis();
        boolean success = false;
        try {
            HttpRequest request = buildRequest(text);
            HttpResponse<InputStream> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofInputStream());
            int code = response.statusCode();
            if (code < 200 || code >= 300) {
                log.warn("[Ave-voice] tts_error provider={} model={} status={}",
                        properties.provider(), properties.model(), code);
                throw new BadRequestException("No pude generar la voz premium.");
            }
            try (InputStream in = response.body()) {
                in.transferTo(output);
                output.flush();
            }
            success = true;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.info("[Ave-voice] tts_cancel provider={} model={}", properties.provider(), properties.model());
        } catch (BadRequestException ex) {
            throw ex;
        } catch (IOException ex) {
            log.warn("[Ave-voice] tts_error provider={} model={} reason=io",
                    properties.provider(), properties.model());
            throw new BadRequestException("No pude generar la voz premium.");
        } finally {
            log.info("[Ave-voice] tts provider={} model={} success={} latencyMs={}",
                    properties.provider(), properties.model(), success, System.currentTimeMillis() - start);
        }
    }

    private HttpRequest buildRequest(String text) throws IOException {
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("stability", properties.stability());
        settings.put("similarity_boost", properties.similarity());
        settings.put("style", properties.style());
        settings.put("use_speaker_boost", true);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", text);
        body.put("model_id", properties.model());
        body.put("language_code", "es");
        body.put("voice_settings", settings);
        String json = objectMapper.writeValueAsString(body);
        String url = properties.baseUrl().replaceAll("/$", "")
                + "/v1/text-to-speech/" + properties.voiceId()
                + "/stream?output_format=" + properties.outputFormat()
                + "&optimize_streaming_latency=" + properties.optimizeStreamingLatency();
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(properties.readTimeoutSeconds()))
                .header("xi-api-key", properties.apiKey())
                .header("Content-Type", "application/json")
                .header("Accept", properties.pcmOutput() ? "*/*" : "audio/mpeg")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
    }
}
