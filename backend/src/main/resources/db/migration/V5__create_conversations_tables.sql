-- V5: conversaciones y mensajes

CREATE TABLE sig.conversations (
    id                   UUID PRIMARY KEY,
    client_id            UUID        NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    status               VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    priority             VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    importance           INT         NOT NULL DEFAULT 3,
    assigned_user_id     UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    unread_count         INT         NOT NULL DEFAULT 0,
    last_message_preview VARCHAR(500),
    last_message_at      TIMESTAMP WITH TIME ZONE,
    channel              VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP',
    category             VARCHAR(80),
    notes                TEXT,
    external_key         VARCHAR(80) UNIQUE,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE sig.conversation_labels (
    conversation_id UUID        NOT NULL REFERENCES sig.conversations (id) ON DELETE CASCADE,
    label           VARCHAR(60) NOT NULL,
    PRIMARY KEY (conversation_id, label)
);

CREATE TABLE sig.messages (
    id              UUID PRIMARY KEY,
    conversation_id UUID        NOT NULL REFERENCES sig.conversations (id) ON DELETE CASCADE,
    direction       VARCHAR(20) NOT NULL,
    body            TEXT        NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'SENT',
    sent_at         TIMESTAMP WITH TIME ZONE NOT NULL,
    sender_type     VARCHAR(20) NOT NULL,
    agent_user_id   UUID REFERENCES sig.users (id) ON DELETE SET NULL
);
