import { QuoteDraft } from '../../../core/services/enterprise-ai.service';

const QUOTE_REQUEST =
  /cotiz|presupuesto|tarifa|cu[aá]nto\s+(cuesta|vale|sale)|genera(?:r)?\s+(el\s+)?(pdf|excel|documento)|descarga(?:r)?\s+(el\s+)?(pdf|excel)|plantilla|pdf\s+de\s+la\s+cotiz|excel\s+de\s+la\s+cotiz/i;

const PEOPLE = /(\d{1,3})\s*(?:personas?|pax|gente)|(?:somos|para|seremos)\s*(\d{1,3})/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+57\s*)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/;
const NIT = /(?:nit|c\.?c\.?|cedula|cédula)[:\s]*([0-9]{6,12}(?:-?\d)?)/i;
const ISO_DATE = /\b(20\d{2}-\d{2}-\d{2})\b/;
const DMY = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}|\d{2}))?\b/;

export function looksLikeQuoteRequest(message: string): boolean {
  return !!message && QUOTE_REQUEST.test(message);
}

export function extractPeople(message: string): number | undefined {
  const m = PEOPLE.exec(message || '');
  if (!m) {
    return undefined;
  }
  const n = Number(m[1] || m[2]);
  return n > 0 ? n : undefined;
}

export function extractQuoteContacts(message: string): Pick<
  QuoteDraft,
  'clientName' | 'clientNit' | 'clientPhone' | 'clientEmail'
> {
  const text = message || '';
  const email = text.match(EMAIL)?.[0];
  const phone = text.match(PHONE)?.[0];
  const nit = text.match(NIT)?.[1];
  const nameMatch = text.match(
    /(?:cliente|nombre)\s*[:\-]?\s*([^\n,]+?)(?=\s+(?:nit|c\.?c|cedula|cédula|celular|correo|email|tel)\b|$)/i
  );
  return {
    clientName: nameMatch?.[1]?.trim(),
    clientNit: nit?.trim(),
    clientPhone: phone?.replace(/[^\d+]/g, ''),
    clientEmail: email?.trim()
  };
}

export function extractPickup(message: string): string | undefined {
  const text = (message || '').toLowerCase();
  const cities = [
    ['armenia', 'Armenia'],
    ['pereira', 'Pereira'],
    ['salento', 'Salento'],
    ['calarc', 'Calarcá'],
    ['filandia', 'Filandia'],
    ['montenegro', 'Montenegro'],
    ['circasia', 'Circasia']
  ] as const;
  for (const [needle, label] of cities) {
    if (text.includes(needle)) {
      return label;
    }
  }
  return undefined;
}

export function extractServiceDate(message: string): string | undefined {
  const text = message || '';
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (/\bpasado\s+manana\b/.test(norm)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return iso(d);
  }
  if (/\bmanana\b/.test(norm)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return iso(d);
  }
  if (/\bhoy\b/.test(norm)) {
    return iso(today);
  }
  const isoMatch = text.match(ISO_DATE);
  if (isoMatch) {
    return isoMatch[1];
  }
  const dmy = text.match(DMY);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = dmy[3] ? Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : today.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (!dmy[3] && candidate.getTime() < today.getTime() - 86400000) {
      year += 1;
    }
    return iso(new Date(year, month - 1, day));
  }
  return undefined;
}

export function mergeQuoteDraft(
  incoming: QuoteDraft,
  message: string,
  previous?: QuoteDraft | null
): QuoteDraft {
  const seeded = seedQuoteDraft(message, previous);
  return {
    ...seeded,
    ...incoming,
    items: incoming.items?.length ? incoming.items : seeded.items,
    clientName: incoming.clientName || seeded.clientName,
    clientNit: incoming.clientNit || seeded.clientNit,
    clientPhone: incoming.clientPhone || seeded.clientPhone,
    clientEmail: incoming.clientEmail || seeded.clientEmail,
    clientCity: incoming.clientCity || seeded.clientCity,
    clientContact: incoming.clientContact || seeded.clientContact,
    advisorName: incoming.advisorName || seeded.advisorName,
    validUntil: incoming.validUntil || seeded.validUntil,
    observations: incoming.observations || seeded.observations,
    pickup: incoming.pickup || seeded.pickup,
    serviceDate: incoming.serviceDate || incoming.date || seeded.serviceDate,
    includes: incoming.includes || seeded.includes,
    excludes: incoming.excludes || seeded.excludes,
    modality: incoming.modality || seeded.modality,
    priceScaleByPax: incoming.priceScaleByPax || seeded.priceScaleByPax
  };
}

export function seedQuoteDraft(message: string, previous?: QuoteDraft | null): QuoteDraft {
  const contacts = extractQuoteContacts(message);
  const people = extractPeople(message) || previous?.people || 2;
  const name = previous?.name || guessTourName(message);
  const unitPrice = previous?.unitPrice || 0;
  const pickup = extractPickup(message) || previous?.pickup;
  const serviceDate = extractServiceDate(message) || previous?.serviceDate;
  const items = previous?.items?.length
    ? previous.items
    : [
        {
          description: name,
          quantity: people,
          unit: 'pax',
          unitPrice,
          discount: 0,
          total: Math.round(unitPrice * people)
        }
      ];
  return {
    ...previous,
    name,
    people,
    modality: previous?.modality || 'PRIVADO',
    currency: previous?.currency || 'COP',
    unitPrice,
    total: previous?.total || items.reduce((sum, item) => sum + (item.total || 0), 0),
    status: previous?.status || 'DRAFT',
    items,
    pickup,
    serviceDate,
    date: serviceDate || previous?.date,
    clientName: contacts.clientName || previous?.clientName,
    clientNit: contacts.clientNit || previous?.clientNit,
    clientPhone: contacts.clientPhone || previous?.clientPhone,
    clientEmail: contacts.clientEmail || previous?.clientEmail,
    clientCity: pickup || previous?.clientCity
  };
}

function guessTourName(message: string): string {
  const text = (message || '').toLowerCase();
  if (text.includes('rafting')) return 'Rafting en el Eje Cafetero';
  if (text.includes('acaime')) return 'Tour Acaime / Trekking RN Acaime';
  if (text.includes('cócora') || text.includes('cocora')) return 'Valle de Cócora';
  if (text.includes('parapente')) return 'Parapente';
  if (text.includes('cabalgata')) return 'Cabalgata ecológica';
  if (text.includes('gallito')) return 'Ruta Gallito de Roca';
  if (text.includes('avistamiento') || text.includes('birding') || /\baves\b/.test(text)) {
    return 'Ruta Aves y Café';
  }
  if (text.includes('café') || text.includes('cafe') || text.includes('finca')) {
    return 'Tour / Finca Café';
  }
  if (text.includes('salento')) return 'Salento y Valle del Cócora';
  return '';
}
