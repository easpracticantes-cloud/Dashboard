package com.escuelaaves.sig.infrastructure.ai.adapters.deepseek;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.infrastructure.ai.adapters.DisabledAiProviderStub;
import org.springframework.stereotype.Component;

/** Stub DeepSeek — listo para implementación futura. */
@Component
public class DeepSeekAdapterStub extends DisabledAiProviderStub {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.DEEPSEEK;
    }

    @Override
    public String providerId() {
        return "deepseek";
    }
}
