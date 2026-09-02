-- A1: tokens de entrada/salida, costo estimado USD y tier de modelo
ALTER TABLE sig.ai_usage_logs
    ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 8),
    ADD COLUMN IF NOT EXISTS model_tier VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_created
    ON sig.ai_usage_logs (provider, created_at DESC);
