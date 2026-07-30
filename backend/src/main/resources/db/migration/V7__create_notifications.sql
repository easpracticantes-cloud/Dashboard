-- V7: notificaciones

CREATE TABLE sig.notifications (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES sig.users (id) ON DELETE CASCADE,
    title      VARCHAR(200) NOT NULL,
    body       TEXT,
    type       VARCHAR(20)  NOT NULL DEFAULT 'INFO',
    "read"     BOOLEAN      NOT NULL DEFAULT FALSE,
    link       VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
