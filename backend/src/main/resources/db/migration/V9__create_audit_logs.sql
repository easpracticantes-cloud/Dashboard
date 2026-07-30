-- V9: auditoría

CREATE TABLE sig.audit_logs (
    id          UUID PRIMARY KEY,
    user_id     UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    action      VARCHAR(30)  NOT NULL,
    entity_type VARCHAR(60),
    entity_id   VARCHAR(100),
    details     TEXT,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
