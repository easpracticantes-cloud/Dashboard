package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Configuración dedicada del RestClient para Gemini.
 * Independiente del RestClient genérico usado por Google Sheets.
 */
@Configuration
@EnableConfigurationProperties(GeminiProperties.class)
public class GeminiRestClientConfig {

    public static final String GEMINI_REST_CLIENT = "geminiRestClient";

    @Bean(name = GEMINI_REST_CLIENT)
    public RestClient geminiRestClient(GeminiProperties properties) {
        ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(Duration.ofSeconds(properties.connectTimeoutSeconds()))
                        .withReadTimeout(Duration.ofSeconds(properties.readTimeoutSeconds()))
        );
        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Content-Type", "application/json")
                .build();
    }
}
