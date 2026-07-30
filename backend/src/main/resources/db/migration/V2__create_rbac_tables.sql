-- V2: RBAC (roles, permissions, role_permissions)
-- Sin CHECK rígidos: los enums viven en Java (RoleName, ModuleCode)

CREATE TABLE sig.roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(30)  NOT NULL UNIQUE,
    description VARCHAR(200)
);

CREATE TABLE sig.permissions (
    id          BIGSERIAL PRIMARY KEY,
    module      VARCHAR(30)  NOT NULL UNIQUE,
    description VARCHAR(200)
);

CREATE TABLE sig.role_permissions (
    id            BIGSERIAL PRIMARY KEY,
    role_id       BIGINT  NOT NULL REFERENCES sig.roles (id) ON DELETE CASCADE,
    permission_id BIGINT  NOT NULL REFERENCES sig.permissions (id) ON DELETE CASCADE,
    can_read      BOOLEAN NOT NULL DEFAULT TRUE,
    can_write     BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);
