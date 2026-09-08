package com.escuelaaves.sig.infrastructure.ai.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.http.HttpClient;
import java.time.Duration;

@Slf4j
@Configuration
@EnableConfigurationProperties(VoiceTtsProperties.class)
public class VoiceTtsConfig {

    public static final String VOICE_HTTP_CLIENT = "voiceHttpClient";

    @Bean(name = VOICE_HTTP_CLIENT)
    public HttpClient voiceHttpClient(VoiceTtsProperties properties) {
        log.info("[Ave-voice] tts provider={} enabled={} model={}",
                properties.provider(), properties.enabled(), properties.model());
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(properties.connectTimeoutSeconds()))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }
}
