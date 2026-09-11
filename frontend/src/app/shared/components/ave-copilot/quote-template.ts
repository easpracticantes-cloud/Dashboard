/** Datos fijos de la plantilla comercial Escuela Aves Salento. */

import { documentTotals, IVA_RATE as SHEET_IVA, splitIvaIncluded } from './quote-sheet.math';

export const QUOTE_TEMPLATE_IMAGE = 'assets/brand/plantilla-cotizacion.jpg';
export const QUOTE_LOGO = 'assets/brand/logo-escuela-aves-salento.png';
export const QUOTE_MARK = 'assets/brand/logo-escuela-aves-mark.png';

export const IVA_RATE = SHEET_IVA;

export const ESCUELA_AVES_COMPANY = {
  legalName: 'ESCUELA AVES SALENTO S.A.S.',
  nit: '901.814.243-5',
  address: 'CR 13 #22-10 ED BARILOCHE LC 27',
  city: 'Salento, Quindío',
  phone: '310 833 7003',
  email: 'escuelaavescontabilidad@gmail.com',
  slogan: '¡La naturaleza se vive!',
  tagline: 'Descubre, observa, protege',
  magic: '¡Vive la magia de Salento con nosotros!',
  footerLine: 'Aves, paisajes y personas que hacen la diferencia',
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
  clientContact?: string;
  clientAddress?: string;
  advisorName?: string;
  notes?: string;
  observations?: string;
  commercialConditions?: string;
  includes?: string;
  excludes?: string;
  quoteNumber?: string;
  issuedAt?: string;
  validUntil?: string;
  items?: Array<{
    description?: string;
    quantity?: number | string;
    unit?: string;
    unitPrice?: number | string;
    discount?: number | string;
    total?: number | string;
  }>;
}

export interface QuoteLineItem {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  total: string;
  rawQuantity: number;
  rawUnitPrice: number;
  rawDiscount: number;
  rawTotal: number;
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

export { splitIvaIncluded } from './quote-sheet.math';

export function fillQuoteTemplate(input: QuoteTemplateInput, now = new Date()): FilledQuoteTemplate {
  const issuedIso = input.issuedAt || toIsoDate(now);
  const validIso = input.validUntil || addDays(issuedIso, 15);
  const currency = input.currency || 'COP';
  const items = buildLineItems(input, currency);
  const money = items.some((item) => item.rawTotal > 0)
    ? documentTotals(items.map((item) => ({
        quantity: item.rawQuantity,
        unitPrice: item.rawUnitPrice,
        discount: item.rawDiscount
      })))
    : splitIvaIncluded(Number(input.total) || 0);
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

function buildLineItems(input: QuoteTemplateInput, currency: string): QuoteLineItem[] {
  if (input.items?.length) {
    return input.items.map((item) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const discount = Number(item.discount) || 0;
      const total = Number(item.total) || Math.max(0, Math.round(qty * unitPrice) - discount);
      return {
        description: item.description || '',
        quantity: qty > 0 ? String(qty) : '',
        unit: item.unit || '',
        unitPrice: unitPrice > 0 ? formatCop(unitPrice, currency) : '',
        discount: discount > 0 ? formatCop(discount, currency) : '',
        total: total > 0 ? formatCop(total, currency) : '',
        rawQuantity: qty,
        rawUnitPrice: unitPrice,
        rawDiscount: discount,
        rawTotal: total
      };
    });
  }
  const qty = Math.max(1, Number(input.people) || 1);
  const fallbackTotal = Number(input.total) || 0;
  const unit = Number(input.unitPrice) || (fallbackTotal ? Math.round(fallbackTotal / qty) : 0);
  const total = fallbackTotal || Math.round(unit * qty);
  const desc = [
    input.name,
    input.modality ? `Modalidad ${input.modality.toLowerCase()}` : '',
    input.date ? `Fecha de servicio ${formatQuoteDate(input.date)}` : '',
    input.pickup ? `Pickup: ${input.pickup}` : '',
    input.includes ? `Incluye: ${compactText(input.includes, 90)}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    {
      description: desc,
      quantity: total || desc ? String(qty) : '',
      unit: 'pax',
      unitPrice: unit > 0 ? formatCop(unit, currency) : '',
      discount: '',
      total: total > 0 ? formatCop(total, currency) : '',
      rawQuantity: qty,
      rawUnitPrice: unit,
      rawDiscount: 0,
      rawTotal: total
    }
  ];
}

function compactText(text: string, max: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function dash(value?: string): string {
  const v = (value || '').trim();
  return v || '—';
}
