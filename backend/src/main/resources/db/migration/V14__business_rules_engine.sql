-- V14: Business Rules Engine (cotizador empresarial — sin IA)

CREATE TABLE sig.business_rules (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(80)  NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    priority    INTEGER      NOT NULL DEFAULT 50,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    tour_code   VARCHAR(40),
    description VARCHAR(500),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE sig.rule_conditions (
    id         BIGSERIAL PRIMARY KEY,
    rule_id    BIGINT       NOT NULL REFERENCES sig.business_rules (id) ON DELETE CASCADE,
    field      VARCHAR(80)  NOT NULL,
    operator   VARCHAR(40)  NOT NULL,
    value_json TEXT         NOT NULL
);

CREATE TABLE sig.rule_actions (
    id          BIGSERIAL PRIMARY KEY,
    rule_id     BIGINT       NOT NULL REFERENCES sig.business_rules (id) ON DELETE CASCADE,
    action_type VARCHAR(80)  NOT NULL,
    payload_json TEXT        NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_business_rules_active ON sig.business_rules (active);
CREATE INDEX idx_business_rules_tour ON sig.business_rules (tour_code);
CREATE INDEX idx_rule_conditions_rule ON sig.rule_conditions (rule_id);
CREATE INDEX idx_rule_actions_rule ON sig.rule_actions (rule_id);

-- Seed: jeep privado si >4 personas
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
VALUES ('JEEP_PRIVATE_GT4', 'Jeep privado si más de 4 personas', 80, TRUE, NULL,
        'Grupos >4 requieren jeep privado');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT id, 'people', 'GT', '4' FROM sig.business_rules WHERE code = 'JEEP_PRIVATE_GT4';

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT id, 'SET_TRANSPORT_MODE', '{"mode":"PRIVATE_JEEP","message":"Jeep privado recomendado (>4 personas)"}'
FROM sig.business_rules WHERE code = 'JEEP_PRIVATE_GT4';

-- Seed: jeep público si ≤4
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
VALUES ('JEEP_PUBLIC_LTE4', 'Jeep público si 4 o menos personas', 70, TRUE, NULL,
        'Grupos ≤4 pueden usar jeep público');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT id, 'people', 'LTE', '4' FROM sig.business_rules WHERE code = 'JEEP_PUBLIC_LTE4';

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT id, 'SET_TRANSPORT_MODE', '{"mode":"PUBLIC_JEEP","message":"Jeep público aplicable (≤4 personas)"}'
FROM sig.business_rules WHERE code = 'JEEP_PUBLIC_LTE4';

-- Guías no pagan entrada
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
VALUES ('GUIDES_NO_ENTRY', 'Guías no pagan entrada', 90, TRUE, NULL,
        'Los guías no pagan entrada al destino');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT id, 'includes_guides', 'EQ', 'true' FROM sig.business_rules WHERE code = 'GUIDES_NO_ENTRY';

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT id, 'WAIVE_ENTRY_FOR_GUIDES', '{"waiveEntry":true,"message":"Guías: sin cobro de entrada"}'
FROM sig.business_rules WHERE code = 'GUIDES_NO_ENTRY';

-- Guías sí pagan almuerzo
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
VALUES ('GUIDES_PAY_LUNCH', 'Guías pagan almuerzo', 85, TRUE, NULL,
        'Los guías sí pagan almuerzo/restaurante');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT id, 'includes_guides', 'EQ', 'true' FROM sig.business_rules WHERE code = 'GUIDES_PAY_LUNCH';

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT id, 'CHARGE_LUNCH_FOR_GUIDES', '{"chargeLunch":true,"message":"Guías: cobrar almuerzo"}'
FROM sig.business_rules WHERE code = 'GUIDES_PAY_LUNCH';

-- Checklist / productos base Acaime
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
VALUES ('ACAIME_BASE_CHECKLIST', 'Checklist base Tour Acaime', 60, TRUE, 'ACAIME',
        'Activa checklist operativa Acaime');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT id, 'tour_code', 'EQ', '"ACAIME"' FROM sig.business_rules WHERE code = 'ACAIME_BASE_CHECKLIST';

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT id, 'ATTACH_CHECKLIST', '{"checklistCode":"ACAIME_OPS","message":"Checklist operativa Acaime"}'
FROM sig.business_rules WHERE code = 'ACAIME_BASE_CHECKLIST';

-- Incluir transporte por defecto en Acaime si no se especificó
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
VALUES ('ACAIME_DEFAULT_TRANSPORT', 'Transporte sugerido Acaime', 55, TRUE, 'ACAIME',
        'Sugiere incluir transporte para Acaime');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT id, 'tour_code', 'EQ', '"ACAIME"' FROM sig.business_rules WHERE code = 'ACAIME_DEFAULT_TRANSPORT';

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT id, 'SUGGEST_TRANSPORT', '{"transport":true,"message":"Se sugiere incluir transporte jeep a Acaime"}'
FROM sig.business_rules WHERE code = 'ACAIME_DEFAULT_TRANSPORT';
