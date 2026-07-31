-- Índices para agregados del command center / comercial (evita full scans en fechas)

CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sig.sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_reservations_reservation_date ON sig.reservations (reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON sig.reservations (status);
CREATE INDEX IF NOT EXISTS idx_quotes_valid_until ON sig.quotes (valid_until);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON sig.quotes (status);
CREATE INDEX IF NOT EXISTS idx_clients_segment ON sig.clients (segment);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON sig.messages (direction);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON sig.conversations (last_message_at DESC NULLS LAST);
