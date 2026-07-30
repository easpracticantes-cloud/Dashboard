-- V4: CRM clientes

CREATE TABLE sig.clients (
    id               UUID PRIMARY KEY,
    name             VARCHAR(150) NOT NULL,
    phone            VARCHAR(30),
    email            VARCHAR(150),
    avatar_url       VARCHAR(255),
    segment          VARCHAR(20)  NOT NULL DEFAULT 'NUEVO',
    source           VARCHAR(60),
    notes            TEXT,
    assigned_user_id UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_contact_at  TIMESTAMP WITH TIME ZONE
);

CREATE TABLE sig.client_tags (
    client_id UUID        NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    tag       VARCHAR(60) NOT NULL,
    PRIMARY KEY (client_id, tag)
);
