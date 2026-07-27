package com.escuelaaves.sig.domain.port.out.integration;

public interface WhatsAppPort extends IntegrationPort {

    boolean sendMessage(String phone, String body);
}
