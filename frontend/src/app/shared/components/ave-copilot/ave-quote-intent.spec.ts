import { describe, expect, it } from 'vitest';
import { extractQuoteContacts, looksLikeQuoteRequest, seedQuoteDraft } from './ave-quote-intent';

describe('ave-quote-intent', () => {
  it('detecta pedido de cotización o PDF', () => {
    expect(looksLikeQuoteRequest('Cotización rafting 4 personas')).toBe(true);
    expect(looksLikeQuoteRequest('Genera el PDF de la cotización')).toBe(true);
    expect(looksLikeQuoteRequest('Hola, ¿qué hora es?')).toBe(false);
  });

  it('saca contacto y personas del mensaje', () => {
    const contacts = extractQuoteContacts(
      'Cliente: Ana Pérez cédula 123456789 celular 3001234567 correo ana@mail.com'
    );
    expect(contacts.clientName).toContain('Ana');
    expect(contacts.clientNit).toBe('123456789');
    expect(contacts.clientPhone).toContain('3001234567');
    expect(contacts.clientEmail).toBe('ana@mail.com');
  });

  it('prellena un borrador para abrir el panel', () => {
    const draft = seedQuoteDraft('Cotización de rafting para 4 personas');
    expect(draft.people).toBe(4);
    expect(draft.name).toMatch(/Rafting/i);
    expect(draft.items?.[0].quantity).toBe(4);
    expect(draft.items?.[0].description).toMatch(/Rafting/i);
  });
});
