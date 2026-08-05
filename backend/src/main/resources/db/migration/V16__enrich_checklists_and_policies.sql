-- V16: enriquecer checklist Acaime según flujo operativo completo + políticas base

-- Ampliar items Acaime (idempotente: solo inserta si faltan)
INSERT INTO sig.tour_checklist_items (checklist_id, code, label, category, required, sort_order)
SELECT c.id, v.code, v.label, v.category, v.required, v.sort_order
FROM sig.tour_checklists c
CROSS JOIN (VALUES
    ('CREATE_RESERVATION', 'Crear reserva en sistema', 'OPS', TRUE, 5),
    ('CREATE_DRIVE_FOLDER', 'Crear carpeta Drive del viaje', 'DOCS', TRUE, 15),
    ('UPLOAD_VOUCHER', 'Subir voucher / comprobante', 'DOCS', TRUE, 25),
    ('REGISTER_CALENDAR', 'Registrar en calendario operativo', 'OPS', TRUE, 35),
    ('ADD_GUIDE', 'Agregar guía asignado', 'GUIDE', TRUE, 55),
    ('CONFIRM_GUIDE_AVAIL', 'Confirmar disponibilidad del guía', 'GUIDE', TRUE, 58),
    ('ASK_BURGER_TYPE', 'Preguntar tipo de hamburguesa / menú', 'RESTAURANT', FALSE, 52),
    ('REGISTER_ENTRIES', 'Registrar entradas al destino', 'TICKETS', TRUE, 42),
    ('REGISTER_TRANSPORT', 'Registrar transporte jeep', 'TRANSPORT', TRUE, 22),
    ('REGISTER_MEDICAL', 'Registrar asistencia médica / seguros', 'OPS', FALSE, 65),
    ('CONFIRM_LODGING', 'Confirmar alojamiento si aplica', 'OPS', FALSE, 75),
    ('CONFIRM_PICKUP', 'Confirmar punto de recogida', 'TRANSPORT', TRUE, 32)
) AS v(code, label, category, required, sort_order)
WHERE c.code = 'ACAIME_OPS'
  AND NOT EXISTS (
      SELECT 1 FROM sig.tour_checklist_items i
      WHERE i.checklist_id = c.id AND i.code = v.code
  );

-- Política de cancelación como regla informativa
INSERT INTO sig.business_rules (code, name, priority, active, tour_code, description)
SELECT 'CANCEL_POLICY_DEFAULT', 'Política de cancelación estándar', 40, TRUE, NULL,
       'Cancelación con 48h: reembolso 50%. Menos de 24h: sin reembolso.'
WHERE NOT EXISTS (SELECT 1 FROM sig.business_rules WHERE code = 'CANCEL_POLICY_DEFAULT');

INSERT INTO sig.rule_conditions (rule_id, field, operator, value_json)
SELECT r.id, 'people', 'GTE', '1'
FROM sig.business_rules r
WHERE r.code = 'CANCEL_POLICY_DEFAULT'
  AND NOT EXISTS (SELECT 1 FROM sig.rule_conditions c WHERE c.rule_id = r.id);

INSERT INTO sig.rule_actions (rule_id, action_type, payload_json)
SELECT r.id, 'ATTACH_POLICY', '{"policy":"CANCEL_48H","message":"Aplicar política de cancelación estándar"}'
FROM sig.business_rules r
WHERE r.code = 'CANCEL_POLICY_DEFAULT'
  AND NOT EXISTS (SELECT 1 FROM sig.rule_actions a WHERE a.rule_id = r.id AND a.action_type = 'ATTACH_POLICY');
