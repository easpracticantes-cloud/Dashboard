-- V13: catálogo de tours y tarifas (precios para cotizaciones IA; nunca calculados por Gemini)

CREATE TABLE sig.tour_products (
    id                     BIGSERIAL PRIMARY KEY,
    code                   VARCHAR(40)    NOT NULL UNIQUE,
    name                   VARCHAR(180)   NOT NULL,
    price_per_person       NUMERIC(14, 2) NOT NULL,
    transport_per_person   NUMERIC(14, 2) NOT NULL DEFAULT 0,
    restaurant_per_person  NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency               VARCHAR(3)     NOT NULL DEFAULT 'COP',
    keywords               VARCHAR(500),
    active                 BOOLEAN        NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_tour_products_active ON sig.tour_products (active);

INSERT INTO sig.tour_products (code, name, price_per_person, transport_per_person, restaurant_per_person, currency, keywords, active)
VALUES
    ('ACAIME', 'Tour Acaime / Valle de Cócora', 120000, 35000, 45000, 'COP', 'acaime,cocora,valle,palma', TRUE),
    ('COCORA', 'Valle de Cócora clásico', 95000, 30000, 40000, 'COP', 'cocora,valle de cocora', TRUE),
    ('FILANDIA', 'Tour Filandia + Salento', 110000, 32000, 42000, 'COP', 'filandia,salento', TRUE),
    ('TERMALES', 'Termales Santa Rosa', 150000, 40000, 50000, 'COP', 'termales,santa rosa,san vicente', TRUE),
    ('CAFE', 'Tour del Café', 85000, 25000, 35000, 'COP', 'cafe,cacao,finca', TRUE);
