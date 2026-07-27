package com.escuelaaves.sig.domain.port.out.integration;

public interface GoogleDrivePort extends IntegrationPort {

    String uploadFile(String fileName, byte[] content);
}
