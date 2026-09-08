package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * TTS premium (capa de voz). Secrets solo vía entorno.
 * No forma parte del cerebro de Ave (Claude).
 */
@ConfigurationProperties(prefix = "app.voice")
public record VoiceTtsProperties(
        String provider,
        String apiKey,
        String model,
        String voiceId,
        String baseUrl,
        String outputFormat,
        int optimizeStreamingLatency,
        double stability,
        double similarity,
        double style,
        int connectTimeoutSeconds,
        int readTimeoutSeconds
) {
    public VoiceTtsProperties {
        if (provider == null || provider.isBlank()) {
            provider = "none";
        }
        provider = provider.trim().toLowerCase();
        if (model == null || model.isBlank()) {
            model = "eleven_flash_v2_5";
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://api.elevenlabs.io";
        }
        if (outputFormat == null || outputFormat.isBlank()) {
            outputFormat = "pcm_24000";
        }
        if (optimizeStreamingLatency < 0 || optimizeStreamingLatency > 4) {
            optimizeStreamingLatency = 3;
        }
        if (stability <= 0 || stability > 1) {
            stability = 0.48;
        }
        if (similarity <= 0 || similarity > 1) {
            similarity = 0.78;
        }
        if (style < 0 || style > 1) {
            style = 0.32;
        }
        if (connectTimeoutSeconds <= 0) {
            connectTimeoutSeconds = 10;
        }
        if (readTimeoutSeconds <= 0) {
            readTimeoutSeconds = 45;
        }
        if (apiKey != null) {
            apiKey = apiKey.trim();
        }
        if (voiceId != null) {
            voiceId = voiceId.trim();
        }
    }

    public boolean enabled() {
        return "elevenlabs".equals(provider)
                && apiKey != null && !apiKey.isBlank()
                && voiceId != null && !voiceId.isBlank();
    }

    public boolean pcmOutput() {
        return outputFormat != null && outputFormat.startsWith("pcm_");
    }

    public int pcmSampleRate() {
        if (!pcmOutput()) {
            return 0;
        }
        try {
            return Integer.parseInt(outputFormat.substring(4));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    public String mediaType() {
        if (outputFormat != null && outputFormat.startsWith("mp3")) {
            return "audio/mpeg";
        }
        if (pcmOutput()) {
            return "application/octet-stream";
        }
        return "application/octet-stream";
    }
}
