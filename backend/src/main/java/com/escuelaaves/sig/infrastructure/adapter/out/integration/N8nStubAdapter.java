package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.N8nPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class N8nStubAdapter implements N8nPort {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.N8N;
    }

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.DISABLED;
    }

    @Override
    public boolean triggerWorkflow(String workflowId, Object payload) {
        log.info("[n8n-STUB] Disparo simulado del workflow '{}'", workflowId);
        return false;
    }
}
