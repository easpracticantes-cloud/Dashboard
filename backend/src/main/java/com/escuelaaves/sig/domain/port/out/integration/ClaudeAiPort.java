package com.escuelaaves.sig.domain.port.out.integration;

public interface ClaudeAiPort extends IntegrationPort {

    String generateSuggestion(String prompt);
}
