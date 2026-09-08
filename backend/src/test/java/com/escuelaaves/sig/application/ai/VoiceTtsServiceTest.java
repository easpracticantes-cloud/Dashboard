package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.infrastructure.ai.config.VoiceTtsProperties;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.http.HttpClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VoiceTtsServiceTest {

    @Test
    void disabledWhenProviderNone() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "none", "kokoro", "bm_george",
                "http://kokoro:8880", "pcm_24000", "e",
                0.92, 10, 60);
        assertFalse(props.enabled());
        VoiceTtsService svc = new VoiceTtsService(props, HttpClient.newHttpClient(), new ObjectMapper());
        assertEquals(false, svc.status().get("enabled"));
        assertEquals("browser", svc.status().get("provider"));
        assertEquals("speechSynthesis", svc.status().get("model"));
        assertThrows(BadRequestException.class, () -> svc.stream("Hola", System.out));
    }

    @Test
    void enabledKokoroWithoutApiKey() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "kokoro", "kokoro", "bm_george",
                "http://kokoro:8880", "pcm_24000", "e",
                0.92, 10, 60);
        assertTrue(props.enabled());
        VoiceTtsService svc = new VoiceTtsService(props, HttpClient.newHttpClient(), new ObjectMapper());
        assertEquals("kokoro", svc.status().get("provider"));
        assertEquals("kokoro", svc.status().get("model"));
        assertEquals("pcm_24000", svc.status().get("format"));
        assertEquals(24000, svc.status().get("sampleRate"));
        assertEquals("application/octet-stream", svc.mediaType());
        assertEquals("pcm", props.kokoroResponseFormat());
        assertEquals("e", props.langCode());
    }

    @Test
    void blankModelDefaultsToKokoro() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "kokoro", "  ", "bm_george",
                "", "", "",
                0, 0, 0);
        assertEquals("kokoro", props.model());
        assertEquals("pcm_24000", props.outputFormat());
        assertEquals("e", props.langCode());
        assertEquals(0.92, props.speed());
        assertEquals("http://kokoro:8880", props.baseUrl());
        assertTrue(props.pcmOutput());
        assertEquals(24000, props.pcmSampleRate());
    }

    @Test
    void mp3FormatKeepsMpegMediaType() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "kokoro", "kokoro", "bm_george",
                "http://kokoro:8880", "mp3", "e",
                0.92, 10, 60);
        assertEquals("audio/mpeg", props.mediaType());
        assertEquals("mp3", props.kokoroResponseFormat());
        assertEquals(0, props.pcmSampleRate());
    }

    @Test
    void missingVoiceDisablesPremium() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "kokoro", "kokoro", "  ",
                "http://kokoro:8880", "pcm_24000", "e",
                0.92, 10, 60);
        assertFalse(props.enabled());
    }
}
