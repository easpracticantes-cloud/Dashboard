package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * TTS local de Ave (Kokoro). No forma parte del cerebro (Claude).
 */
@ConfigurationProperties(prefix = "app.voice")
public record VoiceTtsProperties(
        String provider,
        String model,
        String voiceId,
        String baseUrl,
        String outputFormat,
        String langCode,
        double speed,
        int connectTimeoutSeconds,
        int readTimeoutSeconds
) {
    public VoiceTtsProperties {
        if (provider == null || provider.isBlank()) {
            provider = "none";
        }
        provider = provider.trim().toLowerCase();
        if (model == null || model.isBlank()) {
            model = "kokoro";
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "http://kokoro:8880";
        }
        if (outputFormat == null || outputFormat.isBlank()) {
            outputFormat = "pcm_24000";
        }
        if (langCode == null || langCode.isBlank()) {
            langCode = "e";
        }
        if (speed <= 0 || speed > 4) {
            speed = 0.92;
        }
        if (connectTimeoutSeconds <= 0) {
            connectTimeoutSeconds = 10;
        }
        if (readTimeoutSeconds <= 0) {
            readTimeoutSeconds = 60;
        }
        if (voiceId != null) {
            voiceId = voiceId.trim();
        }
        langCode = langCode.trim();
        model = model.trim();
        baseUrl = baseUrl.trim();
    }

    public boolean enabled() {
        return "kokoro".equals(provider)
                && voiceId != null && !voiceId.isBlank()
                && baseUrl != null && !baseUrl.isBlank();
    }

    public boolean pcmOutput() {
        return outputFormat != null && outputFormat.startsWith("pcm");
    }

    public int pcmSampleRate() {
        if (!pcmOutput()) {
            return 0;
        }
        int sep = outputFormat.indexOf('_');
        if (sep < 0) {
            return 24000;
        }
        try {
            return Integer.parseInt(outputFormat.substring(sep + 1));
        } catch (NumberFormatException ex) {
            return 24000;
        }
    }

    public String kokoroResponseFormat() {
        if (outputFormat != null && outputFormat.startsWith("mp3")) {
            return "mp3";
        }
        return "pcm";
    }

    public String mediaType() {
        if ("mp3".equals(kokoroResponseFormat())) {
            return "audio/mpeg";
        }
        return "application/octet-stream";
    }
}
