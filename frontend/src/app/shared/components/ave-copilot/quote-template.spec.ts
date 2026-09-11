import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildQuoteNumber,
  fillQuoteTemplate,
  formatCop,
  formatQuoteDate,
  splitIvaIncluded
} from './quote-template';

describe('quote-template', () => {
  it('parte un total con IVA incluido al 19%', () => {
    const money = splitIvaIncluded(119000);
    expect(money.subtotal).toBe(100000);
    expect(money.iva).toBe(19000);
    expect(money.total).toBe(119000);
  });

  it('llena la plantilla con la cotización actual', () => {
    const filled = fillQuoteTemplate(
      {
        code: 'ACAIME',
        name: 'Acaime y Valle de Cócora',
        modality: 'PRIVADO',
        people: 4,
        unitPrice: 250000,
        total: 1000000,
        date: '2026-09-20',
        pickup: 'Salento',
        clientName: 'Ana Pérez',
        clientNit: '123456789',
        includes: 'Guía y transporte',
        excludes: 'Almuerzo'
      },
      new Date(2026, 8, 11)
    );
    expect(filled.quoteNumber).toBe('ACAIME-20260911');
    expect(filled.issuedAt).toBe('11/09/2026');
    expect(filled.validUntil).toBe('26/09/2026');
    expect(filled.clientName).toBe('Ana Pérez');
    expect(filled.clientCity).toBe('Salento');
    expect(filled.items[0].quantity).toBe('4');
    expect(filled.items[0].description).toContain('Acaime y Valle de Cócora');
    expect(filled.rawTotal).toBe(1000000);
    expect(filled.clientName).toBe('Ana Pérez');
  });

  it('deja un guion discreto cuando el cliente está vacío', () => {
    const filled = fillQuoteTemplate({ name: 'Tour' });
    expect(filled.clientName).toBe('—');
    expect(filled.clientEmail).toBe('—');
  });

  it('formatea dinero y fechas de calendario', () => {
    expect(formatCop(1250000)).toBe('$ 1.250.000');
    expect(formatQuoteDate('2026-12-30')).toBe('30/12/2026');
    expect(addDays('2026-09-11', 15)).toBe('2026-09-26');
    expect(buildQuoteNumber('rafting_eje', new Date(2026, 0, 5))).toBe('RAFTINGE-20260105');
  });

  it('acepta ítems estructurados de la IA o del editor', () => {
    const filled = fillQuoteTemplate({
      clientName: 'Juan Pérez',
      items: [
        { description: 'Transporte Armenia', quantity: 20, unit: 'pax', unitPrice: 50000, discount: 0 },
        { description: 'Alojamiento 3 noches', quantity: 20, unit: 'pax', unitPrice: 120000, discount: 0 }
      ]
    });
    expect(filled.items).toHaveLength(2);
    expect(filled.rawTotal).toBe(3400000);
    expect(filled.total).toBe('$ 3.400.000');
  });
});
