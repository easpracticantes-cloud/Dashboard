-- V11: índices adicionales para sync CRM / dashboard

CREATE INDEX IF NOT EXISTS idx_clients_phone ON sig.clients (phone);
CREATE INDEX IF NOT EXISTS idx_conversations_external_key ON sig.conversations (external_key);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON sig.conversations (priority);
CREATE INDEX IF NOT EXISTS idx_conversations_category ON sig.conversations (category);
CREATE INDEX IF NOT EXISTS idx_conversations_importance ON sig.conversations (importance);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON sig.conversations (channel);
CREATE INDEX IF NOT EXISTS idx_quotes_code ON sig.quotes (code);
CREATE INDEX IF NOT EXISTS idx_reservations_code ON sig.reservations (code);
CREATE INDEX IF NOT EXISTS idx_sales_code ON sig.sales (code);
