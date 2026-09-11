import { QuoteDraft } from '../../../core/services/enterprise-ai.service';

const QUOTE_REQUEST =
  /cotiz|presupuesto|tarifa|cu[aá]nto\s+(cuesta|vale|sale)|genera(?:r)?\s+(el\s+)?(pdf|excel|documento)|descarga(?:r)?\s+(el\s+)?(pdf|excel)|plantilla|pdf\s+de\s+la\s+cotiz|excel\s+de\s+la\s+cotiz/i;

const PEOPLE = /(\d{1,3})\s*(?:personas?|pax|gente)|(?:somos|para|seremos)\s*(\d{1,3})/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+57\s*)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/;
const NIT = /(?:nit|c\.?c\.?|cedula|cédula)[:\s]*([0-9]{6,12}(?:-?\d)?)/i;

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
    observations: incoming.observations || seeded.observations
  };
}

export function seedQuoteDraft(message: string, previous?: QuoteDraft | null): QuoteDraft {
  const contacts = extractQuoteContacts(message);
  const people = extractPeople(message) || previous?.people || 2;
  const name = previous?.name || guessTourName(message);
  const unitPrice = previous?.unitPrice || 0;
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
    clientName: contacts.clientName || previous?.clientName,
    clientNit: contacts.clientNit || previous?.clientNit,
    clientPhone: contacts.clientPhone || previous?.clientPhone,
    clientEmail: contacts.clientEmail || previous?.clientEmail
  };
}

function guessTourName(message: string): string {
  const text = (message || '').toLowerCase();
  if (text.includes('rafting')) return 'Rafting en el Eje Cafetero';
  if (text.includes('acaime')) return 'Acaime';
  if (text.includes('cócora') || text.includes('cocora')) return 'Valle de Cócora';
  if (text.includes('parapente')) return 'Parapente';
  if (text.includes('cabalgata')) return 'Cabalgata ecológica';
  return '';
}
