package com.escuelaaves.sig.infrastructure.ai.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Slf4j
@Configuration
@EnableConfigurationProperties(AnthropicProperties.class)
public class AnthropicRestClientConfig {

    public static final String ANTHROPIC_REST_CLIENT = "anthropicRestClient";
    public static final String WORKSPACE_HEADER = "anthropic-workspace-id";

    @Bean(name = ANTHROPIC_REST_CLIENT)
    public RestClient anthropicRestClient(AnthropicProperties properties) {
        ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(Duration.ofSeconds(properties.connectTimeoutSeconds()))
                        .withReadTimeout(Duration.ofSeconds(properties.readTimeoutSeconds()))
        );
        RestClient.Builder builder = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Content-Type", "application/json")
                .defaultHeader("anthropic-version", properties.apiVersion());

        // Header genérico Anthropic: se aplica a todo POST /v1/messages (y demás rutas).
        // No loguear el valor del workspace id ni la API key.
        if (properties.hasWorkspaceId()) {
            builder.defaultHeader(WORKSPACE_HEADER, properties.workspaceId());
            log.info("[Anthropic] RestClient listo (workspaceId configurado=true)");
        } else {
            log.info("[Anthropic] RestClient listo (workspaceId configurado=false)");
        }

        return builder.build();
    }
}
