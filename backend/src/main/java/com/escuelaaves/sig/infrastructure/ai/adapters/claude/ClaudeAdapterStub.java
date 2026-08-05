package com.escuelaaves.sig.infrastructure.ai.adapters.claude;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.infrastructure.ai.adapters.DisabledAiProviderStub;
import org.springframework.stereotype.Component;

/** Stub Claude/Anthropic — listo para implementación futura. */
@Component
public class ClaudeAdapterStub extends DisabledAiProviderStub {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.CLAUDE_AI;
    }

    @Override
    public String providerId() {
        return "claude";
    }
}
