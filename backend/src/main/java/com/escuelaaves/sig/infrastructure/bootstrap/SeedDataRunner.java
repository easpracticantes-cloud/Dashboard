package com.escuelaaves.sig.infrastructure.bootstrap;

import com.escuelaaves.sig.domain.model.ModuleCode;
import com.escuelaaves.sig.domain.model.RoleName;
import com.escuelaaves.sig.domain.model.SettingCategory;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.PermissionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RoleEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RolePermissionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SystemSettingEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.PermissionJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.RoleJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.RolePermissionJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.SystemSettingJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.UserJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Seed minimo: roles, permisos, configuracion base y un unico usuario administrador.
 * Solo corre con SEED_ENABLED=true y despues de que Flyway haya creado las tablas.
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class SeedDataRunner implements ApplicationRunner {

    private static final String SHEETS_WEBAPP_URL =
            "https://script.google.com/macros/s/AKfycbxSHKjze5jsBZmMoBX8KI6er59OW80OBycH6Shh5oMXLNhxD77qoWOesFTy9A1KV3pm-g/exec";

    private static final String ADMIN_USERNAME = "admin";

    /** Tablas minimas exigidas por el checklist de despliegue. */
    private static final List<String> REQUIRED_TABLES = List.of(
            "roles",
            "users",
            "system_settings"
    );

    private final RoleJpaRepository roleJpaRepository;
    private final PermissionJpaRepository permissionJpaRepository;
    private final RolePermissionJpaRepository rolePermissionJpaRepository;
    private final UserJpaRepository userJpaRepository;
    private final SystemSettingJpaRepository systemSettingJpaRepository;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;

    @Value("${app.seed.enabled:true}")
    private boolean seedEnabled;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!seedEnabled) {
            log.info("Seed de datos desactivado (SEED_ENABLED=false)");
            return;
        }

        assertRequiredTablesExist();

        boolean rolesPresent = roleJpaRepository.count() > 0;
        boolean usersPresent = userJpaRepository.count() > 0;
        boolean settingsPresent = systemSettingJpaRepository.count() > 0;

        if (rolesPresent || usersPresent || settingsPresent) {
            log.info(
                    "Seed inicial omitido (ya hay datos: roles={}, users={}, settings={})",
                    rolesPresent, usersPresent, settingsPresent
            );
            ensureSheetSettings();
            ensureAdminExistsIfRolesReady();
            return;
        }

        log.info("Ejecutando seed minimo (solo admin)...");

        Map<RoleName, RoleEntity> roles = seedRolesAndPermissions();
        seedAdmin(roles);
        seedSettings();

        log.info("Seed completado");
    }

    private void assertRequiredTablesExist() {
        for (String table : REQUIRED_TABLES) {
            if (!tableExists(table)) {
                throw new IllegalStateException(
                        "Tabla requerida ausente: sig." + table
                                + ". Flyway debe crear el schema antes del seed "
                                + "(spring.flyway.enabled=true, classpath:db/migration)."
                );
            }
        }
    }

    private boolean tableExists(String table) {
        Boolean exists = jdbcTemplate.queryForObject(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'sig'
                      AND table_name = ?
                )
                """,
                Boolean.class,
                table
        );
        return Boolean.TRUE.equals(exists);
    }

    /**
     * Si hay roles pero falta el admin (seed interrumpido), lo recrea sin duplicar roles.
     */
    private void ensureAdminExistsIfRolesReady() {
        if (userJpaRepository.existsByUsername(ADMIN_USERNAME)) {
            return;
        }
        roleJpaRepository.findAll().stream()
                .filter(r -> r.getName() == RoleName.ADMINISTRADOR)
                .findFirst()
                .ifPresentOrElse(adminRole -> {
                    seedAdmin(Map.of(RoleName.ADMINISTRADOR, adminRole));
                    log.info("Usuario admin recreado (faltaba tras seed parcial)");
                }, () -> log.warn("No hay rol ADMINISTRADOR; no se puede recrear admin"));
    }

    private Map<RoleName, RoleEntity> seedRolesAndPermissions() {
        Map<RoleName, String> roleDescriptions = Map.of(
                RoleName.ADMINISTRADOR, "Acceso total al sistema y a la administracion de usuarios",
                RoleName.SUPERVISOR, "Supervision comercial y operativa del equipo",
                RoleName.ASESOR, "Atencion de clientes, conversaciones y pipeline comercial",
                RoleName.GERENCIA, "Vision integral del negocio con permisos de escritura, salvo gestion de usuarios",
                RoleName.COMERCIAL, "Gestion de clientes y conversaciones comerciales",
                RoleName.CONTABILIDAD, "Consulta de indicadores financieros y reportes",
                RoleName.OPERACIONES, "Atencion operativa de clientes y conversaciones"
        );

        Map<RoleName, RoleEntity> roles = new java.util.HashMap<>();
        for (RoleName roleName : RoleName.values()) {
            RoleEntity role = roleJpaRepository.save(RoleEntity.builder()
                    .name(roleName)
                    .description(roleDescriptions.get(roleName))
                    .build());
            roles.put(roleName, role);
        }

        Map<ModuleCode, PermissionEntity> permissions = new java.util.HashMap<>();
        for (ModuleCode module : ModuleCode.values()) {
            PermissionEntity permission = permissionJpaRepository.save(PermissionEntity.builder()
                    .module(module)
                    .description("Acceso al modulo " + module.name())
                    .build());
            permissions.put(module, permission);
        }

        Set<ModuleCode> all = EnumSet.allOf(ModuleCode.class);
        Set<ModuleCode> gerenciaWrite = EnumSet.complementOf(EnumSet.of(ModuleCode.USERS));
        Set<ModuleCode> comercial = EnumSet.of(ModuleCode.DASHBOARD, ModuleCode.CONVERSATIONS, ModuleCode.CLIENTS,
                ModuleCode.QUOTES, ModuleCode.RESERVATIONS, ModuleCode.SALES, ModuleCode.AI, ModuleCode.HELP,
                ModuleCode.NOTIFICATIONS, ModuleCode.PROFILE, ModuleCode.REPORTS);
        Set<ModuleCode> comercialWrite = EnumSet.of(ModuleCode.CONVERSATIONS, ModuleCode.CLIENTS,
                ModuleCode.QUOTES, ModuleCode.RESERVATIONS, ModuleCode.SALES,
                ModuleCode.NOTIFICATIONS, ModuleCode.PROFILE);
        Set<ModuleCode> contabilidad = EnumSet.of(ModuleCode.DASHBOARD, ModuleCode.ANALYTICS, ModuleCode.REPORTS,
                ModuleCode.NOTIFICATIONS, ModuleCode.PROFILE, ModuleCode.CLIENTS, ModuleCode.SALES, ModuleCode.HELP);
        Set<ModuleCode> contabilidadWrite = EnumSet.of(ModuleCode.PROFILE);
        Set<ModuleCode> operaciones = EnumSet.of(ModuleCode.DASHBOARD, ModuleCode.CONVERSATIONS, ModuleCode.CLIENTS,
                ModuleCode.RESERVATIONS, ModuleCode.NOTIFICATIONS, ModuleCode.PROFILE, ModuleCode.HELP);
        Set<ModuleCode> operacionesWrite = EnumSet.of(ModuleCode.CONVERSATIONS, ModuleCode.CLIENTS,
                ModuleCode.RESERVATIONS, ModuleCode.NOTIFICATIONS, ModuleCode.PROFILE);

        assignPermissions(roles.get(RoleName.ADMINISTRADOR), permissions, all, all);
        assignPermissions(roles.get(RoleName.SUPERVISOR), permissions, all, gerenciaWrite);
        assignPermissions(roles.get(RoleName.ASESOR), permissions, comercial, comercialWrite);
        assignPermissions(roles.get(RoleName.GERENCIA), permissions, all, gerenciaWrite);
        assignPermissions(roles.get(RoleName.COMERCIAL), permissions, comercial, comercialWrite);
        assignPermissions(roles.get(RoleName.CONTABILIDAD), permissions, contabilidad, contabilidadWrite);
        assignPermissions(roles.get(RoleName.OPERACIONES), permissions, operaciones, operacionesWrite);

        return roles;
    }

    private void assignPermissions(RoleEntity role, Map<ModuleCode, PermissionEntity> permissions,
                                    Set<ModuleCode> readable, Set<ModuleCode> writable) {
        for (ModuleCode module : readable) {
            rolePermissionJpaRepository.save(RolePermissionEntity.builder()
                    .role(role)
                    .permission(permissions.get(module))
                    .canRead(true)
                    .canWrite(writable.contains(module))
                    .build());
        }
    }

    private void seedAdmin(Map<RoleName, RoleEntity> roles) {
        if (userJpaRepository.existsByUsername(ADMIN_USERNAME)) {
            return;
        }
        RoleEntity adminRole = roles.get(RoleName.ADMINISTRADOR);
        if (adminRole == null) {
            throw new IllegalStateException("Rol ADMINISTRADOR no disponible para seed de admin");
        }
        userJpaRepository.save(UserEntity.builder()
                .username(ADMIN_USERNAME)
                .email("admin@escuelaavessalento.com")
                .passwordHash(passwordEncoder.encode("Admin123!"))
                .fullName("Samuel Gomez")
                .avatarUrl("https://api.dicebear.com/7.x/initials/svg?seed=Samuel+Gomez")
                .role(adminRole)
                .active(true)
                .build());
    }

    private void seedSettings() {
        record SeedSetting(String key, String value, SettingCategory category) {
        }

        List<SeedSetting> settings = List.of(
                new SeedSetting("company.name", "Escuela Aves Salento", SettingCategory.GENERAL),
                new SeedSetting("company.timezone", "America/Bogota", SettingCategory.GENERAL),
                new SeedSetting("company.language", "es-CO", SettingCategory.GENERAL),
                new SeedSetting("notifications.emailEnabled", "true", SettingCategory.NOTIFICATIONS),
                new SeedSetting("notifications.whatsappEnabled", "true", SettingCategory.NOTIFICATIONS),
                new SeedSetting("integrations.whatsappProvider", "meta-business-api", SettingCategory.INTEGRATIONS),
                new SeedSetting("integrations.googleSheetsEnabled", "true", SettingCategory.INTEGRATIONS),
                new SeedSetting("integrations.googleSheets.spreadsheetId", "", SettingCategory.INTEGRATIONS),
                new SeedSetting("integrations.googleSheets.range", "Conversaciones!A2:H", SettingCategory.INTEGRATIONS),
                new SeedSetting("integrations.googleSheets.pollSeconds", "120", SettingCategory.INTEGRATIONS),
                new SeedSetting(
                        "integrations.googleSheets.webAppUrl",
                        SHEETS_WEBAPP_URL,
                        SettingCategory.INTEGRATIONS
                ),
                new SeedSetting("security.sessionTimeoutMinutes", "120", SettingCategory.SECURITY),
                new SeedSetting("security.passwordResetTokenMinutes", "30", SettingCategory.SECURITY),
                new SeedSetting("appearance.theme", "light", SettingCategory.APPEARANCE),
                new SeedSetting("appearance.primaryColor", "#0B3D2E", SettingCategory.APPEARANCE)
        );

        for (SeedSetting setting : settings) {
            if (systemSettingJpaRepository.findBySettingKey(setting.key()).isPresent()) {
                continue;
            }
            systemSettingJpaRepository.save(SystemSettingEntity.builder()
                    .settingKey(setting.key())
                    .settingValue(setting.value())
                    .category(setting.category())
                    .build());
        }
    }

    private void ensureSheetSettings() {
        upsertSettingIfMissing("integrations.googleSheets.spreadsheetId", "", SettingCategory.INTEGRATIONS);
        upsertSettingIfMissing("integrations.googleSheets.range", "Conversaciones!A2:H", SettingCategory.INTEGRATIONS);
        upsertSettingIfMissing("integrations.googleSheets.pollSeconds", "120", SettingCategory.INTEGRATIONS);
        upsertSettingIfMissing("integrations.googleSheetsEnabled", "true", SettingCategory.INTEGRATIONS);
        // Solo si falta: no pisar una URL nueva que el equipo puso en BD / Settings
        upsertSettingIfMissing("integrations.googleSheets.webAppUrl", SHEETS_WEBAPP_URL, SettingCategory.INTEGRATIONS);
        systemSettingJpaRepository.findBySettingKey("integrations.googleSheetsEnabled").ifPresent(s -> {
            if (!"true".equalsIgnoreCase(s.getSettingValue())) {
                s.setSettingValue("true");
                systemSettingJpaRepository.save(s);
            }
        });
    }

    private void upsertSettingForce(String key, String value, SettingCategory category) {
        systemSettingJpaRepository.findBySettingKey(key).ifPresentOrElse(existing -> {
            if (!value.equals(existing.getSettingValue())) {
                existing.setSettingValue(value);
                systemSettingJpaRepository.save(existing);
                log.info("Actualizada setting {} a nueva URL de Apps Script", key);
            }
        }, () -> systemSettingJpaRepository.save(SystemSettingEntity.builder()
                .settingKey(key)
                .settingValue(value)
                .category(category)
                .build()));
    }

    private void upsertSettingIfMissing(String key, String value, SettingCategory category) {
        if (systemSettingJpaRepository.findBySettingKey(key).isEmpty()) {
            systemSettingJpaRepository.save(SystemSettingEntity.builder()
                    .settingKey(key)
                    .settingValue(value)
                    .category(category)
                    .build());
        }
    }
}
