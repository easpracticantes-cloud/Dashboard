-- V6: pipeline comercial (quotes, reservations, sales)

CREATE TABLE sig.quotes (
    id          UUID PRIMARY KEY,
    code        VARCHAR(40)    NOT NULL UNIQUE,
    client_id   UUID           NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    advisor_id  UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    title       VARCHAR(180)   NOT NULL,
    description TEXT,
    amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency    VARCHAR(3)     NOT NULL DEFAULT 'COP',
    status      VARCHAR(20)    NOT NULL DEFAULT 'DRAFT',
    valid_until DATE,
    issued_at   DATE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP WITH TIME ZONE
);

CREATE TABLE sig.reservations (
    id               UUID PRIMARY KEY,
    code             VARCHAR(40)    NOT NULL UNIQUE,
    client_id        UUID           NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    advisor_id       UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    quote_id         UUID REFERENCES sig.quotes (id) ON DELETE SET NULL,
    experience_name  VARCHAR(180)   NOT NULL,
    party_size       INT            NOT NULL DEFAULT 1,
    reservation_date DATE           NOT NULL,
    amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status           VARCHAR(20)    NOT NULL DEFAULT 'CONFIRMED',
    notes            TEXT,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE sig.sales (
    id              UUID PRIMARY KEY,
    code            VARCHAR(40)    NOT NULL UNIQUE,
    client_id       UUID           NOT NULL REFERENCES sig.clients (id) ON DELETE CASCADE,
    advisor_id      UUID REFERENCES sig.users (id) ON DELETE SET NULL,
    reservation_id  UUID REFERENCES sig.reservations (id) ON DELETE SET NULL,
    concept         VARCHAR(180)   NOT NULL,
    amount          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency        VARCHAR(3)     NOT NULL DEFAULT 'COP',
    sale_date       DATE           NOT NULL,
    status          VARCHAR(20)    NOT NULL DEFAULT 'COMPLETED',
    payment_method  VARCHAR(60),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
