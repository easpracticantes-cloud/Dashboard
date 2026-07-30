package com.escuelaaves.sig.infrastructure.bootstrap;

import com.escuelaaves.sig.application.service.SheetsSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Tras el seed, proyecta Google Sheets al CRM en segundo plano
 * para no bloquear el arranque / health check de Render.
 */
@Slf4j
@Component
@Order(5)
@RequiredArgsConstructor
public class SheetsBootstrapSyncRunner implements ApplicationRunner {

    private final SheetsSyncService sheetsSyncService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            var result = sheetsSyncService.syncNowAsync();
            log.info(
                    "Bootstrap Sheets sync lanzado: success={} rows={} msg={}",
                    result.success(),
                    result.rowsRead(),
                    result.message()
            );
        } catch (Exception ex) {
            log.warn("Bootstrap Sheets sync omitido/fallido: {}", ex.getMessage());
        }
    }
}
