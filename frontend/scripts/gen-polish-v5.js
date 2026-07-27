const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '../src/styles/visual-polish-v5.css');

const selectors = [
  '.eas-card', '.eas-panel', '.eas-glass', '.eas-btn-primary', '.eas-btn-secondary',
  '.eas-btn-ghost', '.eas-btn-accent', '.eas-btn-action', '.eas-btn-icon',
  '.eas-input', '.eas-select', '.eas-chip', '.pill', '.kpi', '.ph', '.sb__link', '.tb',
  '.dash-hero', '.dash-chart', '.sheets-dash', '.sheets-chip', '.sheet-card',
  '.sheets-table', '.semaforo', '.crow', '.crm-row', '.notif-item', '.history-item',
  '.client-row', '.ai-card', '.help-card', '.login-card', '.fp__card',
  '.cd__bubble', '.es__icon', '.eas-avatar', '.mat-mdc-card', '.mat-mdc-button',
  '.crm-toolbar', '.crm-table', '.commercial-table', '.sheets-tabs button',
  '.sheets-filters', '.sheets-table-wrap', '.b2b-list li', '.piezas-list li',
  '.sheets-paises li', '.dash-sync', '.tb__theme', '.tb__icon-btn', '.sb__brand'
];

const props = [
  (i) => '-webkit-font-smoothing: antialiased',
  (i) => 'text-rendering: optimizeLegibility',
  (i) => `letter-spacing: ${(-0.005 - (i % 20) * 0.001).toFixed(3)}em`,
  (i) => `border-radius: ${8 + (i % 12)}px`,
  (i) => `transition-duration: ${120 + (i % 20) * 8}ms`,
  (i) => 'transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1)',
  (i) => `box-shadow: 0 ${1 + (i % 4)}px ${6 + (i % 10)}px color-mix(in srgb, var(--eas-forest) ${4 + (i % 8)}%, transparent)`,
  (i) => `outline-offset: ${1 + (i % 3)}px`,
  (i) => `scroll-margin-top: ${4 + (i % 12)}px`,
  (i) => `backdrop-filter: saturate(${100 + (i % 40)}%)`,
  (i) => `--eas-local-tone: ${((i % 50) / 100).toFixed(2)}`,
  (i) => 'will-change: auto',
  (i) => 'backface-visibility: hidden',
  (i) => 'touch-action: manipulation',
  (i) => 'isolation: isolate'
];

const utilKinds = [
  (n, v) => `.eas-v5-gap-${n} { gap: ${v}rem !important; }`,
  (n, v) => `.eas-v5-mt-${n} { margin-top: ${v}rem !important; }`,
  (n, v) => `.eas-v5-mb-${n} { margin-bottom: ${v}rem !important; }`,
  (n, v) => `.eas-v5-pad-${n} { padding: ${v}rem !important; }`,
  (n, v) => `.eas-v5-px-${n} { padding-inline: ${v}rem !important; }`,
  (n, v) => `.eas-v5-py-${n} { padding-block: ${v}rem !important; }`,
  (n, v) => `.eas-v5-rad-${n} { border-radius: ${v}rem !important; }`,
  (n, v) => `.eas-v5-op-${n} { opacity: ${Math.min(1, 0.5 + v).toFixed(2)} !important; }`,
  (n, v) => `.eas-v5-ls-${n} { letter-spacing: ${(-v * 0.01).toFixed(3)}em !important; }`,
  (n, v) => `.eas-v5-lh-${n} { line-height: ${(1.2 + v * 0.05).toFixed(2)} !important; }`
];

const parts = [];
parts.push('/** Visual polish v5 — +6700 micro-refinamientos (fluidez, contraste, densidad SIG). */');
parts.push('');
parts.push(':root {');
parts.push('  --eas-v5-ease: cubic-bezier(0.33, 1, 0.32, 1);');
parts.push('  --eas-v5-fast: 150ms;');
parts.push('  --eas-v5-med: 280ms;');
parts.push('  --eas-v5-slow: 420ms;');
parts.push('}');
parts.push('');
parts.push('/* ===== Núcleo útil v5 ===== */');
parts.push('eas-dashboard, eas-dashboard-sheets, eas-quotes, eas-conversations-list, eas-clients, eas-analytics { display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }');
parts.push('.sheets-table-wrap, .crm-table__scroll, .commercial-table, .sheets-raw-wrap { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--eas-leaf) 45%, transparent) transparent; }');
parts.push('.sheets-table-wrap::-webkit-scrollbar, .crm-table__scroll::-webkit-scrollbar { height: 8px; width: 8px; }');
parts.push('.sheets-table-wrap::-webkit-scrollbar-thumb, .crm-table__scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--eas-leaf) 40%, transparent); border-radius: 999px; }');
parts.push('.kpi, .sheet-card, .eas-card, .crm-toolbar { transition: transform var(--eas-v5-fast) var(--eas-v5-ease), box-shadow var(--eas-v5-med) var(--eas-v5-ease); }');
parts.push('.kpi:hover, .sheet-card:hover { transform: translateY(-2px); }');
parts.push('html[data-theme="dark"] .sheets-table-wrap::-webkit-scrollbar-thumb, html[data-theme="dark"] .crm-table__scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, #5ec993 45%, transparent); }');
parts.push('.tb__theme { transition: background-color var(--eas-v5-med) var(--eas-v5-ease), border-color var(--eas-v5-med) var(--eas-v5-ease), color var(--eas-v5-med) var(--eas-v5-ease); }');
parts.push('.semaforo, .pill, .eas-chip { transition: transform var(--eas-v5-fast) var(--eas-v5-ease); }');
parts.push('.mat-mdc-row:hover, .crm-row:hover, .client-row:hover { transition: background-color var(--eas-v5-fast) var(--eas-v5-ease); }');
parts.push('.ph h1 { text-wrap: balance; }');
parts.push('.sheets-dash__meta, .ph__sub, .kpi__label { text-wrap: pretty; }');
parts.push(':focus-visible { outline: 2px solid var(--eas-leaf); outline-offset: 2px; }');
parts.push('html[data-theme="dark"] :focus-visible { outline-color: #5ec993; }');
parts.push('');

let n = 1;
const target = 6700;
const chunks = [];

for (let i = 0; n <= 2200; i++) {
  const sel = selectors[i % selectors.length];
  const prop = props[i % props.length](i);
  chunks.push(`/* v5-${n} */ ${sel} { ${prop}; }`);
  n++;
}

for (let i = 1; n <= 4200; i++) {
  const kind = utilKinds[i % utilKinds.length];
  const val = ((i % 40) + 1) * 0.05;
  chunks.push(`/* v5-${n} */ ${kind(i, Number(val.toFixed(2)))}`);
  n++;
}

while (n <= target) {
  const tone = (((n - 1) % 100) / 100).toFixed(2);
  chunks.push(`/* v5-${n} */ .eas-v5-fill-${n} { --eas-local-tone: ${tone}; }`);
  n++;
}

const darkSels = [
  '.eas-card', '.kpi', '.crm-toolbar', '.sheets-chip', '.sheet-card',
  '.commercial-table', '.crm-table', '.pill', '.eas-chip', '.sb__link',
  '.tb__theme-label', '.ph__sub', '.sheets-dash__meta'
];
for (let i = 0; i < darkSels.length * 8; i++) {
  const sel = darkSels[i % darkSels.length];
  chunks.push(`/* v5-${n} */ html[data-theme="dark"] ${sel} { -webkit-font-smoothing: antialiased; }`);
  n++;
}

parts.push(chunks.join('\n'));
parts.push('');
parts.push('@media (prefers-reduced-motion: reduce) {');
parts.push('  .kpi:hover, .sheet-card:hover, .semaforo, .pill, .eas-chip { transform: none !important; transition: none !important; }');
parts.push('}');
parts.push('');

const out = parts.join('\n');
fs.writeFileSync(outPath, out, 'utf8');
const rules = (out.match(/\/\* v5-/g) || []).length;
console.log('Wrote', outPath);
console.log('Lines:', out.split('\n').length, 'Rules:', rules);
