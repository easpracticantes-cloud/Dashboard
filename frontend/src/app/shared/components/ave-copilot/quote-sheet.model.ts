import { QuoteDraft } from '../../../core/services/enterprise-ai.service';
import { documentTotals, lineTotal } from './quote-sheet.math';
import { addDays, buildQuoteNumber, toIsoDate } from './quote-template';

export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
export type QuoteSheetStatus = (typeof QUOTE_STATUSES)[number];

export interface QuoteSheetItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface QuoteSheetDocument {
  quoteNumber: string;
  issuedAt: string;
  validUntil: string;
  status: QuoteSheetStatus;
  advisorName: string;
  clientName: string;
  clientNit: string;
  clientContact: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  clientCity: string;
  items: QuoteSheetItem[];
  observations: string;
  commercialConditions: string;
  currency: string;
  code?: string;
  name?: string;
  modality?: string;
  people?: number;
  pickup?: string;
  includes?: string;
  excludes?: string;
  notes?: string;
  reviewFlag?: boolean;
  priceScaleByPax?: Record<string, number>;
}

export function newItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyQuoteItem(): QuoteSheetItem {
  return {
    id: newItemId(),
    description: '',
    quantity: 1,
    unit: 'pax',
    unitPrice: 0,
    discount: 0,
    total: 0
  };
}

export function recalcItem(item: QuoteSheetItem): QuoteSheetItem {
  return { ...item, total: lineTotal(item.quantity, item.unitPrice, item.discount) };
}

export function displayDash(value?: string | number | null): string {
  if (value == null) {
    return '—';
  }
  const text = String(value).trim();
  return text || '—';
}

export function draftToDocument(draft: QuoteDraft, now = new Date()): QuoteSheetDocument {
  const issuedAt = draft.issuedAt || toIsoDate(now);
  const validUntil = draft.validUntil || addDays(issuedAt, 15);
  const items = resolveItems(draft);
  const people = Math.max(1, Number(draft.people) || items[0]?.quantity || 1);
  const observations = [
    draft.observations,
    draft.notes,
    draft.excludes ? `No incluye: ${draft.excludes}` : ''
  ]
    .filter((part) => !!part && String(part).trim())
    .filter((part, i, all) => all.indexOf(part) === i)
    .join('\n');
  return {
    quoteNumber: draft.quoteNumber || buildQuoteNumber(draft.code, now),
    issuedAt,
    validUntil,
    status: normalizeStatus(draft.status),
    advisorName: draft.advisorName || '',
    clientName: draft.clientName || '',
    clientNit: draft.clientNit || '',
    clientContact: draft.clientContact || '',
    clientPhone: draft.clientPhone || '',
    clientEmail: draft.clientEmail || '',
    clientAddress: draft.clientAddress || '',
    clientCity: draft.clientCity || draft.pickup || '',
    items,
    observations,
    commercialConditions: draft.commercialConditions || '',
    currency: draft.currency || 'COP',
    code: draft.code,
    name: draft.name,
    modality: draft.modality,
    people,
    pickup: draft.pickup,
    includes: draft.includes,
    excludes: draft.excludes,
    notes: draft.notes,
    reviewFlag: draft.reviewFlag,
    priceScaleByPax: draft.priceScaleByPax
  };
}

export function documentToDraft(doc: QuoteSheetDocument): QuoteDraft {
  const money = documentTotals(doc.items);
  const first = doc.items[0];
  return {
    code: doc.code,
    name: doc.name || first?.description || '',
    modality: doc.modality,
    people: doc.people || first?.quantity || 1,
    unitPrice: first?.unitPrice || 0,
    total: money.total,
    currency: doc.currency || 'COP',
    date: doc.issuedAt,
    pickup: doc.pickup || doc.clientCity,
    clientName: emptyToUndef(doc.clientName),
    clientNit: emptyToUndef(doc.clientNit),
    clientPhone: emptyToUndef(doc.clientPhone),
    clientEmail: emptyToUndef(doc.clientEmail),
    clientCity: emptyToUndef(doc.clientCity),
    clientContact: emptyToUndef(doc.clientContact),
    clientAddress: emptyToUndef(doc.clientAddress),
    advisorName: emptyToUndef(doc.advisorName),
    quoteNumber: emptyToUndef(doc.quoteNumber),
    issuedAt: emptyToUndef(doc.issuedAt),
    validUntil: emptyToUndef(doc.validUntil),
    status: doc.status,
    notes: emptyToUndef(doc.notes),
    observations: emptyToUndef(doc.observations),
    commercialConditions: emptyToUndef(doc.commercialConditions),
    includes: emptyToUndef(doc.includes),
    excludes: emptyToUndef(doc.excludes),
    reviewFlag: doc.reviewFlag,
    priceScaleByPax: doc.priceScaleByPax,
    items: doc.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discount: item.discount,
      total: item.total
    }))
  };
}

export function previewItems(items: QuoteSheetItem[], editing: boolean): QuoteSheetItem[] {
  const list = (items || []).map(recalcItem);
  if (editing) {
    return list.length ? list : [emptyQuoteItem()];
  }
  const padded = [...list];
  while (padded.length < 5) {
    padded.push({
      id: `pad-${padded.length}`,
      description: '',
      quantity: 0,
      unit: '',
      unitPrice: 0,
      discount: 0,
      total: 0
    });
  }
  return padded;
}

function resolveItems(draft: QuoteDraft): QuoteSheetItem[] {
  if (draft.items?.length) {
    return draft.items.map((item) =>
      recalcItem({
        id: newItemId(),
        description: item.description || '',
        quantity: Math.max(0, Number(item.quantity) || 0),
        unit: item.unit || 'pax',
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        total: 0
      })
    );
  }
  const qty = Math.max(1, Number(draft.people) || 1);
  const unit = Number(draft.unitPrice) || 0;
  const fallbackTotal = Number(draft.total) || 0;
  const unitPrice = unit || (fallbackTotal ? Math.round(fallbackTotal / qty) : 0);
  const description = [
    draft.name,
    draft.modality ? `Modalidad ${draft.modality.toLowerCase()}` : '',
    draft.pickup ? `Pickup: ${draft.pickup}` : '',
    draft.includes ? `Incluye: ${draft.includes}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    recalcItem({
      id: newItemId(),
      description,
      quantity: qty,
      unit: 'pax',
      unitPrice,
      discount: 0,
      total: 0
    })
  ];
}

function normalizeStatus(value?: string): QuoteSheetStatus {
  const upper = (value || 'DRAFT').toUpperCase();
  return (QUOTE_STATUSES as readonly string[]).includes(upper) ? (upper as QuoteSheetStatus) : 'DRAFT';
}

function emptyToUndef(value?: string): string | undefined {
  const v = (value || '').trim();
  return v || undefined;
}
