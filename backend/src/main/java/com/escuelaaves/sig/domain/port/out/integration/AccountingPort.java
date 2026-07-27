package com.escuelaaves.sig.domain.port.out.integration;

public interface AccountingPort extends IntegrationPort {

    boolean syncInvoice(String reference, Object payload);
}
