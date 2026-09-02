package com.escuelaaves.sig.infrastructure.ai.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
@EnableConfigurationProperties(AnthropicProperties.class)
public class AnthropicRestClientConfig {

    public static final String ANTHROPIC_REST_CLIENT = "anthropicRestClient";

    @Bean(name = ANTHROPIC_REST_CLIENT)
    public RestClient anthropicRestClient(AnthropicProperties properties) {
        ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(Duration.ofSeconds(properties.connectTimeoutSeconds()))
                        .withReadTimeout(Duration.ofSeconds(properties.readTimeoutSeconds()))
        );
        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Content-Type", "application/json")
                .defaultHeader("anthropic-version", properties.apiVersion())
                .build();
    }
}
