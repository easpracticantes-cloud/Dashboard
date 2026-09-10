-- Importación de chats de WhatsApp hacia el Excel de Registro (auditoría, sin el chat crudo).

CREATE TABLE sig.whatsapp_import_audits (
    id              UUID PRIMARY KEY,
    filename        VARCHAR(255) NOT NULL,
    file_hash       VARCHAR(64),
    source_kind     VARCHAR(16) NOT NULL,
    message_count   INTEGER,
    model           VARCHAR(80),
    extracted_json  TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PREVIEW',
    confirmed_by    VARCHAR(128),
    confirmed_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ix_whatsapp_import_hash ON sig.whatsapp_import_audits (file_hash);
CREATE INDEX ix_whatsapp_import_status ON sig.whatsapp_import_audits (status);
