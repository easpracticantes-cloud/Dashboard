package com.escuelaaves.sig.infrastructure.ai.adapters.openai;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.infrastructure.ai.adapters.DisabledAiProviderStub;
import org.springframework.stereotype.Component;

/** Stub OpenAI — listo para implementación futura. */
@Component
public class OpenAiAdapterStub extends DisabledAiProviderStub {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.OPENAI;
    }

    @Override
    public String providerId() {
        return "openai";
    }
}
