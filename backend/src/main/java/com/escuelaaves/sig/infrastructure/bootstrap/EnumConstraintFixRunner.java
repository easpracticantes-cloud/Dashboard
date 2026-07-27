package com.escuelaaves.sig.infrastructure.bootstrap;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Hibernate crea CHECK constraints sobre enums que no se actualizan con ddl-auto=update.
 * Este runner elimina esos checks para permitir nuevos roles/modulos.
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
            log.info("Constraint {} removido de {}", constraint, table);
        } catch (Exception ex) {
            log.debug("No se pudo remover {}: {}", constraint, ex.getMessage());
        }
    }
}
