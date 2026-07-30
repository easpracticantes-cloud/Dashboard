-- V8: configuración del sistema

CREATE TABLE sig.system_settings (
    id            BIGSERIAL PRIMARY KEY,
    setting_key   VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    category      VARCHAR(30)  NOT NULL DEFAULT 'GENERAL'
);
