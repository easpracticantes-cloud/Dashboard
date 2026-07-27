package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.AccountingPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class AccountingStubAdapter implements AccountingPort {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.ACCOUNTING;
    }

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.DISABLED;
    }

    @Override
    public boolean syncInvoice(String reference, Object payload) {
        log.info("[Accounting-STUB] Sincronizacion simulada de factura '{}'", reference);
        return false;
    }
}
