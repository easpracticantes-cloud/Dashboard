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
    void disabledWithoutKey() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "elevenlabs", "", "eleven_flash_v2_5", "voice",
                "https://api.elevenlabs.io", "pcm_24000", 3,
                0.48, 0.78, 0.32, 10, 45);
        assertFalse(props.enabled());
        VoiceTtsService svc = new VoiceTtsService(props, HttpClient.newHttpClient(), new ObjectMapper());
        assertEquals(false, svc.status().get("enabled"));
        assertEquals("browser", svc.status().get("provider"));
        assertEquals("speechSynthesis", svc.status().get("model"));
        assertThrows(BadRequestException.class, () -> svc.stream("Hola", System.out));
    }

    @Test
    void enabledWithKeyAndVoice() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "elevenlabs", "sk_test", "eleven_flash_v2_5", "Rt1JHkPO27QCUX6Nd5bV",
                "https://api.elevenlabs.io", "pcm_24000", 3,
                0.48, 0.78, 0.32, 10, 45);
        assertTrue(props.enabled());
        VoiceTtsService svc = new VoiceTtsService(props, HttpClient.newHttpClient(), new ObjectMapper());
        assertEquals("elevenlabs", svc.status().get("provider"));
        assertEquals("eleven_flash_v2_5", svc.status().get("model"));
        assertEquals("pcm_24000", svc.status().get("format"));
        assertEquals(24000, svc.status().get("sampleRate"));
        assertEquals("application/octet-stream", svc.mediaType());
    }

    @Test
    void blankModelDefaultsToFlashConversational() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "elevenlabs", "sk_test", "  ", "Rt1JHkPO27QCUX6Nd5bV",
                "https://api.elevenlabs.io", "", 3,
                0.48, 0.78, 0.32, 10, 45);
        assertEquals("eleven_flash_v2_5", props.model());
        assertEquals("pcm_24000", props.outputFormat());
        assertTrue(props.pcmOutput());
        assertEquals(24000, props.pcmSampleRate());
    }

    @Test
    void mp3FormatKeepsMpegMediaType() {
        VoiceTtsProperties props = new VoiceTtsProperties(
                "elevenlabs", "sk_test", "eleven_flash_v2_5", "voice",
                "https://api.elevenlabs.io", "mp3_44100_128", 3,
                0.48, 0.78, 0.32, 10, 45);
        assertEquals("audio/mpeg", props.mediaType());
        assertEquals(0, props.pcmSampleRate());
    }
}
