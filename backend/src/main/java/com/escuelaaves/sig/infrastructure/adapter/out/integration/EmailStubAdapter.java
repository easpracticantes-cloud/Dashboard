package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.EmailPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class EmailStubAdapter implements EmailPort {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.EMAIL;
    }

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.READY;
    }

    @Override
    public boolean sendEmail(String to, String subject, String body) {
        log.info("[Email-STUB] Envio simulado a {} - Asunto: {}", to, subject);
        return true;
    }
}
