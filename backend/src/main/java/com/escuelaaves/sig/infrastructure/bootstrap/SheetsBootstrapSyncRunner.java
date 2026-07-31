package com.escuelaaves.sig.infrastructure.bootstrap;

import com.escuelaaves.sig.application.service.SheetsSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Al arrancar Spring Boot, sincroniza Google Sheets → PostgreSQL en segundo plano
 * (persistencia completa vía {@link SheetsSyncService#syncNow()}).
 * No bloquea el health check de Render.
 */
@Slf4j
@Component
@Order(5)
@RequiredArgsConstructor
public class SheetsBootstrapSyncRunner {

    private final SheetsSyncService sheetsSyncService;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        Thread t = new Thread(() -> {
            try {
                log.info("[SHEETS-SYNC] ApplicationReady → sincronización completa de arranque");
                var result = sheetsSyncService.syncNow();
                log.info(
                        "[SHEETS-SYNC] Bootstrap completado: success={} rowsRead={} clients={} conversations={} msg={}",
                        result.success(),
                        result.rowsRead(),
                        result.clientsUpserted(),
                        result.conversationsUpserted(),
                        result.message()
                );
            } catch (Exception ex) {
                log.warn("[SHEETS-SYNC] Bootstrap falló: {}", ex.getMessage());
            }
        }, "sheets-bootstrap");
        t.setDaemon(true);
        t.start();
    }
}
