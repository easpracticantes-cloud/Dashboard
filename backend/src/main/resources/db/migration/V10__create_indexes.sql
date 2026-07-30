-- V10: índices de rendimiento

CREATE INDEX idx_clients_assigned_user ON sig.clients (assigned_user_id);
CREATE INDEX idx_clients_segment ON sig.clients (segment);
CREATE INDEX idx_clients_last_contact ON sig.clients (last_contact_at DESC NULLS LAST);

CREATE INDEX idx_conversations_client ON sig.conversations (client_id);
CREATE INDEX idx_conversations_assigned_user ON sig.conversations (assigned_user_id);
CREATE INDEX idx_conversations_status ON sig.conversations (status);
CREATE INDEX idx_conversations_last_message_at ON sig.conversations (last_message_at DESC NULLS LAST);

CREATE INDEX idx_messages_conversation ON sig.messages (conversation_id);
CREATE INDEX idx_messages_sent_at ON sig.messages (sent_at DESC);

CREATE INDEX idx_notifications_user ON sig.notifications (user_id);
CREATE INDEX idx_notifications_user_read ON sig.notifications (user_id, "read");

CREATE INDEX idx_role_permissions_role ON sig.role_permissions (role_id);

CREATE INDEX idx_quotes_client ON sig.quotes (client_id);
CREATE INDEX idx_quotes_status ON sig.quotes (status);
CREATE INDEX idx_quotes_advisor ON sig.quotes (advisor_id);

CREATE INDEX idx_reservations_client ON sig.reservations (client_id);
CREATE INDEX idx_reservations_date ON sig.reservations (reservation_date);
CREATE INDEX idx_reservations_status ON sig.reservations (status);

CREATE INDEX idx_sales_client ON sig.sales (client_id);
CREATE INDEX idx_sales_date ON sig.sales (sale_date);
CREATE INDEX idx_sales_status ON sig.sales (status);

CREATE INDEX idx_audit_logs_user ON sig.audit_logs (user_id);
CREATE INDEX idx_audit_logs_created ON sig.audit_logs (created_at DESC);

CREATE INDEX idx_refresh_tokens_user ON sig.refresh_tokens (user_id);
CREATE INDEX idx_password_reset_tokens_user ON sig.password_reset_tokens (user_id);
