-- Cotizaciones inteligentes (independientes de WhatsApp).

CREATE TABLE sig.intelligent_quotes (
    id                   UUID PRIMARY KEY,
    status               VARCHAR(32) NOT NULL DEFAULT 'PREVIEW',
    quote_code           VARCHAR(40),
    commercial_quote_id  UUID,
    client_id            UUID,
    client_name          VARCHAR(255),
    confidence           VARCHAR(16),
    instructions         TEXT,
    extraction_json      TEXT,
    draft_json           TEXT NOT NULL,
    missing_json         TEXT,
    warnings_json        TEXT,
    trace_json           TEXT,
    created_by           VARCHAR(128),
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ix_intelligent_quotes_status ON sig.intelligent_quotes (status);
CREATE INDEX ix_intelligent_quotes_client ON sig.intelligent_quotes (client_id);
CREATE INDEX ix_intelligent_quotes_created ON sig.intelligent_quotes (created_at DESC);
