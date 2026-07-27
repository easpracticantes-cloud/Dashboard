package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.ClaudeAiPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Adaptador stub para las funciones de IA (sugerencias de reabastecimiento,
 * pronosticos basicos y deteccion de anomalias delegadas a un LLM).
 */
@Slf4j
@Component
public class ClaudeAiStubAdapter implements ClaudeAiPort {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.CLAUDE_AI;
    }

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.DISABLED;
    }

    @Override
    public String generateSuggestion(String prompt) {
        log.info("[ClaudeAI-STUB] Sugerencia simulada para prompt de {} caracteres", prompt != null ? prompt.length() : 0);
        return "Sugerencia no disponible: integracion con Claude AI pendiente de configuracion.";
    }
}
