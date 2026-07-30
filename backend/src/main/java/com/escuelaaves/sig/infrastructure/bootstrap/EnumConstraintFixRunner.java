package com.escuelaaves.sig.infrastructure.bootstrap;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Compatibilidad con BD legacy: elimina CHECK de enums si existieran
 * (Flyway actual no los crea; es no-op en deploys nuevos).
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class EnumConstraintFixRunner implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        dropIfExists("sig.roles", "roles_name_check");
        dropIfExists("sig.permissions", "permissions_module_check");
        dropIfExists("sig.conversations", "conversations_status_check");
        dropIfExists("sig.conversations", "conversations_priority_check");
        dropIfExists("sig.conversations", "conversations_channel_check");
        dropIfExists("sig.quotes", "quotes_status_check");
        dropIfExists("sig.reservations", "reservations_status_check");
        dropIfExists("sig.sales", "sales_status_check");
    }

    private void dropIfExists(String table, String constraint) {
        try {
            jdbcTemplate.execute("ALTER TABLE " + table + " DROP CONSTRAINT IF EXISTS " + constraint);
            log.debug("Constraint {} removido de {} (si existia)", constraint, table);
        } catch (Exception ex) {
            log.debug("No se pudo remover {}: {}", constraint, ex.getMessage());
        }
    }
}
