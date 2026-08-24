/**
 * Genera SQL seeds desde catalogo_comercial_eas_2026.json
 * node scripts/generate-seed-sql-from-catalog.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogPath = path.join(root, 'backend/src/main/resources/ai/catalogo_comercial_eas_2026.json');
const c = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/'/g, "''");
}
function kw(arr) {
  return esc((arr || []).slice(0, 12).join(',').slice(0, 480));
}
function trunc(s, n) {
  s = s == null ? '' : String(s);
  return s.length <= n ? s : s.slice(0, n - 1);
}

let productsSql = `-- Seed completo tarifas 2026 desde catalogo_comercial_eas_2026.json
-- price_per_person = escala 1 pax (venta). Transporte/restaurante = 0 (paquete incluido en tarifa).
-- Para cotizar por #pax usa el JSON (priceScaleByPax); PG guarda referencia 1 pax.

INSERT INTO sig.tour_products (
    code, name, price_per_person, transport_per_person, restaurant_per_person, currency, keywords, active
) VALUES
`;

const pvals = c.products.map((p) => {
  const price = p.pricePerPerson1Pax ?? (p.priceScaleByPax && p.priceScaleByPax['1']) ?? 0;
  const code = trunc(p.code, 40);
  const name = trunc(p.name + (p.modality ? ' [' + p.modality + ']' : ''), 180);
  return `    ('${esc(code)}', '${esc(name)}', ${price}, 0, 0, '${p.currency || 'COP'}', '${kw(p.keywords)}', ${p.active !== false})`;
});
productsSql += pvals.join(',\n') + `
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    price_per_person = EXCLUDED.price_per_person,
    transport_per_person = EXCLUDED.transport_per_person,
    restaurant_per_person = EXCLUDED.restaurant_per_person,
    currency = EXCLUDED.currency,
    keywords = EXCLUDED.keywords,
    active = EXCLUDED.active;
`;

let providersSql = `-- Seed completo proveedores 2026 desde catalogo_comercial_eas_2026.json

INSERT INTO sig.tour_providers (
    code, name, category, tour_code, notes, priority, active
) VALUES
`;

const prvals = c.providers.map((p) => {
  const code = trunc(p.code, 80);
  const name = trunc(p.name, 200);
  const cat = trunc(p.category || 'EXPERIENCE', 80);
  const tour = trunc(p.tourCode || '', 40);
  const notes = trunc(p.notes || '', 500);
  const prio = p.priority != null ? p.priority : 50;
  const tourSql = tour ? `'${esc(tour)}'` : 'NULL';
  return `    ('${esc(code)}', '${esc(name)}', '${esc(cat)}', ${tourSql}, '${esc(notes)}', ${prio}, ${p.active !== false})`;
});
providersSql += prvals.join(',\n') + `
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    tour_code = EXCLUDED.tour_code,
    notes = EXCLUDED.notes,
    priority = EXCLUDED.priority,
    active = EXCLUDED.active;
`;

fs.writeFileSync(path.join(root, 'documentos/seed_tour_products_2026.sql'), productsSql);
fs.writeFileSync(path.join(root, 'documentos/seed_tour_providers_2026.sql'), providersSql);
console.log('OK products=', c.products.length, 'providers=', c.providers.length);
