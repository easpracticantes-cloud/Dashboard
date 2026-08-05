-- V15: checklists, proveedores recomendados, memoria de conversación IA, observabilidad

CREATE TABLE sig.tour_checklists (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(80)  NOT NULL UNIQUE,
    tour_code  VARCHAR(40)  NOT NULL,
    title      VARCHAR(200) NOT NULL,
    active     BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE sig.tour_checklist_items (
    id          BIGSERIAL PRIMARY KEY,
    checklist_id BIGINT      NOT NULL REFERENCES sig.tour_checklists (id) ON DELETE CASCADE,
    code        VARCHAR(80)  NOT NULL,
    label       VARCHAR(300) NOT NULL,
    category    VARCHAR(80)  NOT NULL DEFAULT 'OPS',
    required    BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE sig.tour_providers (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(80)  NOT NULL UNIQUE,
    name       VARCHAR(200) NOT NULL,
    category   VARCHAR(80)  NOT NULL,
    tour_code  VARCHAR(40),
    notes      VARCHAR(500),
    priority   INTEGER      NOT NULL DEFAULT 50,
    active     BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE sig.ai_conversation_sessions (
    id         VARCHAR(64) PRIMARY KEY,
    user_id    BIGINT,
    title      VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sig.ai_conversation_messages (
    id         BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sig.ai_conversation_sessions (id) ON DELETE CASCADE,
    role       VARCHAR(40) NOT NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sig.ai_usage_logs (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT,
    endpoint          VARCHAR(120),
    operation         VARCHAR(80)  NOT NULL,
    provider          VARCHAR(40)  NOT NULL,
    model             VARCHAR(80),
    latency_ms        BIGINT,
    estimated_tokens  INTEGER,
    success           BOOLEAN      NOT NULL DEFAULT TRUE,
    error_message     VARCHAR(500),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_tour ON sig.tour_checklists (tour_code);
CREATE INDEX idx_checklist_items_parent ON sig.tour_checklist_items (checklist_id);
CREATE INDEX idx_tour_providers_tour ON sig.tour_providers (tour_code, category);
CREATE INDEX idx_ai_messages_session ON sig.ai_conversation_messages (session_id);
CREATE INDEX idx_ai_usage_created ON sig.ai_usage_logs (created_at);

-- Checklist operativa Acaime
INSERT INTO sig.tour_checklists (code, tour_code, title, active)
VALUES ('ACAIME_OPS', 'ACAIME', 'Checklist operativa Tour Acaime', TRUE);

INSERT INTO sig.tour_checklist_items (checklist_id, code, label, category, required, sort_order)
SELECT c.id, v.code, v.label, v.category, v.required, v.sort_order
FROM sig.tour_checklists c
CROSS JOIN (VALUES
    ('CONFIRM_PAX', 'Confirmar número de personas y guías', 'OPS', TRUE, 10),
    ('JEEP_TYPE', 'Definir jeep público o privado', 'TRANSPORT', TRUE, 20),
    ('PICKUP_POINT', 'Confirmar punto y hora de recogida', 'TRANSPORT', TRUE, 30),
    ('ENTRY_TICKETS', 'Gestionar entradas (guías sin cobro)', 'TICKETS', TRUE, 40),
    ('LUNCH_RESERVE', 'Reservar almuerzo (guías sí pagan)', 'RESTAURANT', TRUE, 50),
    ('GUIDE_ASSIGN', 'Asignar guía local / birdwatching', 'GUIDE', TRUE, 60),
    ('WEATHER_CHECK', 'Revisar clima y recomendaciones de ropa', 'OPS', FALSE, 70),
    ('PAYMENT_STATUS', 'Verificar anticipo / estado de pago', 'FINANCE', TRUE, 80)
) AS v(code, label, category, required, sort_order)
WHERE c.code = 'ACAIME_OPS';

-- Proveedores recomendados
INSERT INTO sig.tour_providers (code, name, category, tour_code, notes, priority, active)
VALUES
    ('JEEP_SALENTO_01', 'Jeeps Salento Centro', 'TRANSPORT', 'ACAIME', 'Pickup plaza principal', 90, TRUE),
    ('GUIDE_BIRD_01', 'Guía birdwatching EAS', 'GUIDE', 'ACAIME', 'Guía oficial Escuela Aves', 95, TRUE),
    ('REST_ACAIME_01', 'Restaurante Acaime Trail', 'RESTAURANT', 'ACAIME', 'Almuerzo típico', 80, TRUE),
    ('JEEP_PUBLIC_01', 'Jeep público Valle', 'TRANSPORT', NULL, 'Compartido ≤4 pax', 70, TRUE);
