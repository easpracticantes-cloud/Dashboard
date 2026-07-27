package com.escuelaaves.sig.domain.port.out.integration;

public interface EmailPort extends IntegrationPort {

    boolean sendEmail(String to, String subject, String body);
}
