-- =====================================================================
-- SIG - Sistema Inteligente de Gestion - Escuela Aves Salento
-- Referencia documental del esquema PostgreSQL (schema: sig)
-- =====================================================================
-- Fuente de verdad en runtime: migraciones Flyway en
--   backend/src/main/resources/db/migration/
-- Este archivo es documentación / referencia. En Docker y Render el
-- backend aplica Flyway al arrancar sobre una BD vacía (schema, tablas,
-- índices) y SeedDataRunner inserta roles/admin/settings.
-- No montar este script en docker-entrypoint-initdb.d.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS sig;

SET search_path TO sig;

-- ---------------------------------------------------------------------
-- Roles y permisos (RBAC)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(30)  NOT NULL UNIQUE
                CHECK (name IN ('ADMINISTRADOR', 'GERENCIA', 'COMERCIAL', 'CONTABILIDAD', 'OPERACIONES')),
    description VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS sig.permissions (
    id          BIGSERIAL PRIMARY KEY,
    module      VARCHAR(30)  NOT NULL UNIQUE
                CHECK (module IN ('DASHBOARD', 'CONVERSATIONS', 'CLIENTS', 'ANALYTICS', 'NOTIFICATIONS',
                                   'SETTINGS', 'PROFILE', 'USERS', 'REPORTS')),
    description VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS sig.role_permissions (
    id            BIGSERIAL PRIMARY KEY,
    role_id       BIGINT  NOT NULL REFERENCES sig.roles (id) ON DELETE CASCADE,
    permission_id BIGINT  NOT NULL REFERENCES sig.permissions (id) ON DELETE CASCADE,
    can_read      BOOLEAN NOT NULL DEFAULT TRUE,
    can_write     BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.users (
    id                        UUID PRIMARY KEY,
    username                  VARCHAR(60)  NOT NULL UNIQUE,
    email                     VARCHAR(150) NOT NULL UNIQUE,
    password_hash             VARCHAR(255) NOT NULL,
    full_name                 VARCHAR(150) NOT NULL,
    avatar_url                VARCHAR(500),
    role_id                   BIGINT       NOT NULL REFERENCES sig.roles (id),
    active                    BOOLEAN      NOT NULL DEFAULT TRUE,
    remember_token            VARCHAR(255),
    remember_token_expires_at TIMESTAMP,
    last_login_at             TIMESTAMP,
    created_at                TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sig.password_reset_tokens (
    id         UUID PRIMARY KEY,
    token      VARCHAR(255) NOT NULL UNIQUE,
    user_id    UUID         NOT NULL REFERENCES sig.users (id) ON DELETE CASCADE,
    expires_at TIMESTAMP    NOT NULL,
    used       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Clientes (CRM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.clients (
    id               UUID PRIMARY KEY,
    name             VARCHAR(150) NOT NULL,
    phone            VARCHAR(30),
    email            VARCHAR(150),
    avatar_url       VARCHAR(500),
    segment          VARCHAR(20)  NOT NULL DEFAULT 'NUEVO'
                     CHECK (segment IN ('NUEVO', 'FRECUENTE', 'VIP', 'INACTIVO')),
    source           VARCHAR(60),
    notes            TEXT,
    assigned_user_id UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT now(),
    last_contact_at  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sig.client_tags (
    client_id UUID        NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    tag       VARCHAR(60) NOT NULL,
    PRIMARY KEY (client_id, tag)
);

-- ---------------------------------------------------------------------
-- Conversaciones y mensajes (bandeja tipo WhatsApp)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.conversations (
    id                   UUID PRIMARY KEY,
    client_id            UUID        NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    status               VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                         CHECK (status IN ('OPEN', 'PENDING', 'RESOLVED', 'ARCHIVED')),
    priority             VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
                         CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    importance           INT         NOT NULL DEFAULT 3,
    assigned_user_id     UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    unread_count         INT         NOT NULL DEFAULT 0,
    last_message_preview VARCHAR(500),
    last_message_at      TIMESTAMP,
    channel              VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP'
                         CHECK (channel IN ('WHATSAPP', 'EMAIL', 'WEB')),
    created_at           TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sig.conversation_labels (
    conversation_id UUID        NOT NULL REFERENCES sig.conversations (id) ON DELETE CASCADE,
    label           VARCHAR(60) NOT NULL,
    PRIMARY KEY (conversation_id, label)
);

CREATE TABLE IF NOT EXISTS sig.messages (
    id              UUID PRIMARY KEY,
    conversation_id UUID        NOT NULL REFERENCES sig.conversations (id) ON DELETE CASCADE,
    direction       VARCHAR(20) NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    body            TEXT        NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'SENT'
                    CHECK (status IN ('SENT', 'DELIVERED', 'READ', 'FAILED')),
    sent_at         TIMESTAMP   NOT NULL,
    sender_type     VARCHAR(20) NOT NULL CHECK (sender_type IN ('CLIENT', 'AGENT', 'SYSTEM')),
    agent_user_id   UUID REFERENCES sig.users (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.notifications (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES sig.users (id) ON DELETE CASCADE,
    title      VARCHAR(200) NOT NULL,
    body       TEXT,
    type       VARCHAR(20)  NOT NULL DEFAULT 'INFO'
               CHECK (type IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'MESSAGE', 'SYSTEM')),
    read       BOOLEAN      NOT NULL DEFAULT FALSE,
    link       VARCHAR(500),
    created_at TIMESTAMP    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Configuracion general del sistema
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.system_settings (
    id            BIGSERIAL PRIMARY KEY,
    setting_key   VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    category      VARCHAR(30)  NOT NULL DEFAULT 'GENERAL'
                  CHECK (category IN ('GENERAL', 'NOTIFICATIONS', 'INTEGRATIONS', 'SECURITY', 'APPEARANCE'))
);

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sig.audit_logs (
    id          UUID PRIMARY KEY,
    user_id     UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    action      VARCHAR(30) NOT NULL
                CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'PASSWORD_RESET',
                                   'ASSIGN', 'STATUS_CHANGE')),
    entity_type VARCHAR(60),
    entity_id   VARCHAR(100),
    details     TEXT,
    created_at  TIMESTAMP   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Indices de apoyo para las consultas mas frecuentes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_assigned_user ON sig.clients (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON sig.conversations (client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user ON sig.conversations (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON sig.conversations (status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON sig.conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON sig.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON sig.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON sig.notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON sig.role_permissions (role_id);
