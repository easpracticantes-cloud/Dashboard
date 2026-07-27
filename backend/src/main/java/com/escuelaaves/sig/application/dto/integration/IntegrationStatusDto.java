package com.escuelaaves.sig.application.dto.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;

public record IntegrationStatusDto(
        IntegrationCode code,
        String name,
        IntegrationStatus status,
        String description
) {
}
