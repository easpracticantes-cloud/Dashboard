package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.application.ai.AveSystemPrompt;
import com.escuelaaves.sig.domain.ai.model.AiProviderType;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.ClaudeAiPort;
import com.escuelaaves.sig.infrastructure.ai.config.AnthropicProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * Estado de integración Claude AI (panel Integraciones).
 * Delega sugerencias al AnthropicAdapter cuando hay API key.
 */
@Slf4j
@Component
public class ClaudeAiStubAdapter implements ClaudeAiPort {

    private final AnthropicProperties anthropicProperties;
    private final AiProviderFactory aiProviderFactory;

    public ClaudeAiStubAdapter(
            AnthropicProperties anthropicProperties,
            @Lazy AiProviderFactory aiProviderFactory
    ) {
        this.anthropicProperties = anthropicProperties;
        this.aiProviderFactory = aiProviderFactory;
    }

    @Override
    public IntegrationCode code() {
        return IntegrationCode.CLAUDE_AI;
    }

    @Override
    public IntegrationStatus status() {
        return anthropicProperties.hasApiKey() ? IntegrationStatus.READY : IntegrationStatus.DISABLED;
    }

    @Override
    public String generateSuggestion(String prompt) {
        if (!anthropicProperties.hasApiKey()) {
            log.info("[ClaudeAI] Sin ANTHROPIC_API_KEY — sugerencia no disponible");
            return "Sugerencia no disponible: define ANTHROPIC_API_KEY para habilitar Claude.";
        }
        try {
            GenerativeAiPort claude = aiProviderFactory.getProvider(AiProviderType.CLAUDE);
            return claude.chat(
                    AveSystemPrompt.SYSTEM,
                    prompt != null ? prompt : ""
            );
        } catch (Exception ex) {
            log.warn("[ClaudeAI] Falló generateSuggestion: {}", ex.getMessage());
            return "No se pudo generar sugerencia: " + ex.getMessage();
        }
    }
}
