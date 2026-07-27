package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.integration.GoogleDrivePort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class GoogleDriveStubAdapter implements GoogleDrivePort {

    @Override
    public IntegrationCode code() {
        return IntegrationCode.GOOGLE_DRIVE;
    }

    @Override
    public IntegrationStatus status() {
        return IntegrationStatus.DISABLED;
    }

    @Override
    public String uploadFile(String fileName, byte[] content) {
        log.info("[GoogleDrive-STUB] Carga simulada del archivo '{}' ({} bytes)", fileName,
                content != null ? content.length : 0);
        return "stub://google-drive/" + fileName;
    }
}
