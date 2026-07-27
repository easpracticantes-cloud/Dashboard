package com.escuelaaves.sig.domain.port.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;

/**
 * Contrato comun para todos los puertos de integracion externa (WhatsApp,
 * Google Sheets, Google Drive, Claude AI, n8n, Email, Contabilidad).
 * Las implementaciones concretas viven como adaptadores stub en
 * infrastructure.adapter.out.integration y podran conectarse a los
 * proveedores reales en una siguiente iteracion.
 */
public interface IntegrationPort {

    IntegrationCode code();

    IntegrationStatus status();
}
