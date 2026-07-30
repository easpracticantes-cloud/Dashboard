-- V3: usuarios y tokens

CREATE TABLE sig.users (
    id                        UUID PRIMARY KEY,
    username                  VARCHAR(60)  NOT NULL UNIQUE,
    email                     VARCHAR(150) NOT NULL UNIQUE,
    password_hash             VARCHAR(255) NOT NULL,
    full_name                 VARCHAR(150) NOT NULL,
    avatar_url                VARCHAR(255),
    role_id                   BIGINT       NOT NULL REFERENCES sig.roles (id),
    active                    BOOLEAN      NOT NULL DEFAULT TRUE,
    remember_token            VARCHAR(255),
    remember_token_expires_at TIMESTAMP WITH TIME ZONE,
    last_login_at             TIMESTAMP WITH TIME ZONE,
    created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP WITH TIME ZONE
);

CREATE TABLE sig.password_reset_tokens (
    id         UUID PRIMARY KEY,
    token      VARCHAR(255) NOT NULL UNIQUE,
    user_id    UUID         NOT NULL REFERENCES sig.users (id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE sig.refresh_tokens (
    id         UUID PRIMARY KEY,
    token      VARCHAR(120) NOT NULL UNIQUE,
    user_id    UUID         NOT NULL REFERENCES sig.users (id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
