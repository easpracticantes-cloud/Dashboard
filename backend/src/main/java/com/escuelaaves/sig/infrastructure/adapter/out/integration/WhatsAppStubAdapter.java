package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.WhatsAppPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Adaptador stub del canal de WhatsApp. En esta iteracion simula el envio de
 * mensajes; una futura integracion conectara con WhatsApp Business API.
 */
@Slf4j
@Component
public class WhatsAppStubAdapter implements WhatsAppPort {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.WHATSAPP;
    }

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.READY;
    }

    @Override
    public boolean sendMessage(String phone, String body) {
        log.info("[WhatsApp-STUB] Envio simulado a {}: {}", phone, body);
        return true;
    }
}
