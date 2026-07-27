package com.escuelaaves.sig.domain.port.out.integration;

public interface N8nPort extends IntegrationPort {

    boolean triggerWorkflow(String workflowId, Object payload);
}
