/** Plantilla comercial Escuela Aves Salento — se llena con la cotización actual. */

export const QUOTE_TEMPLATE_IMAGE = 'assets/brand/plantilla-cotizacion.jpg';
export const QUOTE_TEMPLATE_SIZE = { width: 682, height: 1024 };

export const IVA_RATE = 0.19;

export const ESCUELA_AVES_COMPANY = {
  legalName: 'ESCUELA AVES SALENTO S.A.S.',
  nit: '901.814.243-5',
  address: 'Cra. 13 #22-10, Ed. Bariloche, Local 27',
  city: 'Salento, Quindío',
  phone: '310 833 7003',
  email: 'escuelaavescontabilidad@gmail.com',
  slogan: '¡La naturaleza se vive!',
  payment: [
    'Forma de pago: 50% a la reserva y 50% el día del tour.',
    'Transferencia bancaria, Nequi o Daviplata.',
    'Cancelación: mínimo 48 horas de anticipación.',
    'Por condiciones climáticas se reprograma; no se reembolsa el valor.'
  ]
} as const;

export interface QuoteTemplateInput {
  code?: string;
  name?: string;
  modality?: string;
  people?: number;
  unitPrice?: number;
  total?: number;
  currency?: string;
  date?: string;
  pickup?: string;
  clientName?: string;
  clientNit?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCity?: string;
  notes?: string;
  includes?: string;
  excludes?: string;
  quoteNumber?: string;
  issuedAt?: string;
  validUntil?: string;
}

export interface QuoteLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

export interface FilledQuoteTemplate {
  quoteNumber: string;
  issuedAt: string;
  validUntil: string;
  clientName: string;
  clientNit: string;
  clientPhone: string;
  clientEmail: string;
  clientCity: string;
  items: QuoteLineItem[];
  subtotal: string;
  iva: string;
  total: string;
  currency: string;
  rawSubtotal: number;
  rawIva: number;
  rawTotal: number;
}

export interface TemplateFieldBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  align?: 'left' | 'right' | 'center';
  font?: number;
  weight?: number;
  color?: string;
}

/** Cajas sobre los placeholders de la plantilla (porcentajes 0–100). */
export const QUOTE_TEMPLATE_BOXES: TemplateFieldBox[] = [
  { id: 'quoteNumber', x: 74.2, y: 23.35, w: 21.5, h: 1.85, font: 1.55, weight: 700 },
  { id: 'issuedAt', x: 74.2, y: 25.55, w: 21.5, h: 1.85, font: 1.45 },
  { id: 'validUntil', x: 74.2, y: 27.75, w: 21.5, h: 1.85, font: 1.45 },
  { id: 'clientName', x: 21.8, y: 34.55, w: 26.2, h: 1.75, font: 1.4 },
  { id: 'clientNit', x: 21.8, y: 36.85, w: 26.2, h: 1.75, font: 1.4 },
  { id: 'clientPhone', x: 21.8, y: 39.15, w: 26.2, h: 1.75, font: 1.4 },
  { id: 'clientEmail', x: 21.8, y: 41.45, w: 26.2, h: 1.75, font: 1.35 },
  { id: 'clientCity', x: 21.8, y: 43.75, w: 26.2, h: 1.75, font: 1.4 },
  { id: 'item1Desc', x: 13.4, y: 51.15, w: 35.6, h: 3.55, font: 1.2 },
  { id: 'item1Qty', x: 50.2, y: 51.55, w: 12.4, h: 2.7, align: 'center', font: 1.35 },
  { id: 'item1Unit', x: 63.2, y: 51.55, w: 15.6, h: 2.7, align: 'right', font: 1.3 },
  { id: 'item1Total', x: 79.4, y: 51.55, w: 15.8, h: 2.7, align: 'right', font: 1.3, weight: 700 },
  { id: 'item2Desc', x: 13.4, y: 55.15, w: 35.6, h: 3.55, font: 1.2 },
  { id: 'item2Qty', x: 50.2, y: 55.55, w: 12.4, h: 2.7, align: 'center', font: 1.35 },
  { id: 'item2Unit', x: 63.2, y: 55.55, w: 15.6, h: 2.7, align: 'right', font: 1.3 },
  { id: 'item2Total', x: 79.4, y: 55.55, w: 15.8, h: 2.7, align: 'right', font: 1.3, weight: 700 },
  { id: 'item3Desc', x: 13.4, y: 59.15, w: 35.6, h: 3.55, font: 1.2 },
  { id: 'item3Qty', x: 50.2, y: 59.55, w: 12.4, h: 2.7, align: 'center', font: 1.35 },
  { id: 'item3Unit', x: 63.2, y: 59.55, w: 15.6, h: 2.7, align: 'right', font: 1.3 },
  { id: 'item3Total', x: 79.4, y: 59.55, w: 15.8, h: 2.7, align: 'right', font: 1.3, weight: 700 },
  { id: 'item4Desc', x: 13.4, y: 63.15, w: 35.6, h: 3.55, font: 1.2 },
  { id: 'item4Qty', x: 50.2, y: 63.55, w: 12.4, h: 2.7, align: 'center', font: 1.35 },
  { id: 'item4Unit', x: 63.2, y: 63.55, w: 15.6, h: 2.7, align: 'right', font: 1.3 },
  { id: 'item4Total', x: 79.4, y: 63.55, w: 15.8, h: 2.7, align: 'right', font: 1.3, weight: 700 },
  { id: 'item5Desc', x: 13.4, y: 67.15, w: 35.6, h: 3.55, font: 1.2 },
  { id: 'item5Qty', x: 50.2, y: 67.55, w: 12.4, h: 2.7, align: 'center', font: 1.35 },
  { id: 'item5Unit', x: 63.2, y: 67.55, w: 15.6, h: 2.7, align: 'right', font: 1.3 },
  { id: 'item5Total', x: 79.4, y: 67.55, w: 15.8, h: 2.7, align: 'right', font: 1.3, weight: 700 },
  { id: 'subtotal', x: 79.4, y: 71.15, w: 15.8, h: 1.9, align: 'right', font: 1.4, weight: 600 },
  { id: 'iva', x: 79.4, y: 73.2, w: 15.8, h: 1.9, align: 'right', font: 1.4, weight: 600 },
  { id: 'total', x: 79.4, y: 75.25, w: 15.8, h: 2.15, align: 'right', font: 1.55, weight: 800, color: '#0b3d28' },
  { id: 'footerPhone', x: 8.2, y: 83.55, w: 22, h: 1.7, font: 1.2, color: '#f4efe4' },
  { id: 'footerEmail', x: 36.5, y: 83.55, w: 28, h: 1.7, font: 1.15, color: '#f4efe4' },
  { id: 'footerAddress', x: 68.2, y: 83.55, w: 26.5, h: 1.7, font: 1.1, color: '#f4efe4' }
];

export function formatCop(amount: number, currency = 'COP'): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n));
  return `$ ${formatted}${currency && currency !== 'COP' ? ` ${currency}` : ''}`;
}

export function formatQuoteDate(value?: string, fallback?: Date): string {
  if (value) {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return `${iso[3]}/${iso[2]}/${iso[1]}`;
    }
    const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatQuoteDate(toIsoDate(parsed));
    }
    return value;
  }
  return formatQuoteDate(toIsoDate(fallback || new Date()));
}

export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return toIsoDate(dt);
}

export function buildQuoteNumber(code?: string, issued = new Date()): string {
  const slug = (code || 'EAS').replace(/[^A-Za-z0-9]+/g, '').slice(0, 8).toUpperCase() || 'EAS';
  return `${slug}-${toIsoDate(issued).replace(/-/g, '')}`;
}

export function splitIvaIncluded(total: number): { subtotal: number; iva: number; total: number } {
  const rawTotal = Math.max(0, Math.round(Number(total) || 0));
  const subtotal = Math.round(rawTotal / (1 + IVA_RATE));
  return { subtotal, iva: rawTotal - subtotal, total: rawTotal };
}

export function fillQuoteTemplate(input: QuoteTemplateInput, now = new Date()): FilledQuoteTemplate {
  const issuedIso = input.issuedAt || toIsoDate(now);
  const validIso = input.validUntil || addDays(issuedIso, 15);
  const money = splitIvaIncluded(Number(input.total) || 0);
  const currency = input.currency || 'COP';
  const items = buildLineItems(input, money, currency);
  return {
    quoteNumber: input.quoteNumber || buildQuoteNumber(input.code, now),
    issuedAt: formatQuoteDate(issuedIso),
    validUntil: formatQuoteDate(validIso),
    clientName: dash(input.clientName),
    clientNit: dash(input.clientNit),
    clientPhone: dash(input.clientPhone),
    clientEmail: dash(input.clientEmail),
    clientCity: dash(input.clientCity || input.pickup),
    items,
    subtotal: formatCop(money.subtotal, currency),
    iva: formatCop(money.iva, currency),
    total: formatCop(money.total, currency),
    currency,
    rawSubtotal: money.subtotal,
    rawIva: money.iva,
    rawTotal: money.total
  };
}

export function overlayValues(filled: FilledQuoteTemplate): Record<string, string> {
  const values: Record<string, string> = {
    quoteNumber: filled.quoteNumber,
    issuedAt: filled.issuedAt,
    validUntil: filled.validUntil,
    clientName: filled.clientName,
    clientNit: filled.clientNit,
    clientPhone: filled.clientPhone,
    clientEmail: filled.clientEmail,
    clientCity: filled.clientCity,
    subtotal: filled.subtotal,
    iva: filled.iva,
    total: filled.total,
    footerPhone: ESCUELA_AVES_COMPANY.phone,
    footerEmail: ESCUELA_AVES_COMPANY.email,
    footerAddress: `${ESCUELA_AVES_COMPANY.address}, ${ESCUELA_AVES_COMPANY.city}`
  };
  filled.items.forEach((item, idx) => {
    const n = idx + 1;
    values[`item${n}Desc`] = item.description;
    values[`item${n}Qty`] = item.quantity;
    values[`item${n}Unit`] = item.unitPrice;
    values[`item${n}Total`] = item.total;
  });
  return values;
}

function buildLineItems(
  input: QuoteTemplateInput,
  money: { subtotal: number; iva: number; total: number },
  currency: string
): QuoteLineItem[] {
  const empty: QuoteLineItem = { description: '', quantity: '', unitPrice: '', total: '' };
  const items: QuoteLineItem[] = [empty, empty, empty, empty, empty].map((x) => ({ ...x }));
  const qty = Math.max(1, Number(input.people) || 1);
  const unit = Number(input.unitPrice) || Math.round(money.total / qty);
  const desc = [
    input.name || 'Experiencia Escuela Aves',
    input.modality ? `Modalidad ${input.modality.toLowerCase()}` : '',
    input.date ? `Fecha de servicio ${formatQuoteDate(input.date)}` : '',
    input.pickup ? `Pickup: ${input.pickup}` : '',
    input.includes ? `Incluye: ${compactText(input.includes, 90)}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  items[0] = {
    description: desc,
    quantity: String(qty),
    unitPrice: formatCop(unit, currency),
    total: formatCop(money.total, currency)
  };
  if (input.excludes) {
    items[1] = {
      description: `No incluye: ${compactText(input.excludes, 110)}`,
      quantity: '',
      unitPrice: '',
      total: ''
    };
  }
  if (input.notes) {
    const slot = input.excludes ? 2 : 1;
    items[slot] = {
      description: `Notas: ${compactText(input.notes, 110)}`,
      quantity: '',
      unitPrice: '',
      total: ''
    };
  }
  return items;
}

function compactText(text: string, max: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function dash(value?: string): string {
  const v = (value || '').trim();
  return v || 'Por confirmar';
}
