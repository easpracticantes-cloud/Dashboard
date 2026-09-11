import { describe, expect, it } from 'vitest';
import { documentTotals, lineTotal, splitIvaIncluded } from './quote-sheet.math';

describe('quote-sheet.math', () => {
  it('calcula línea y documento en COP enteros', () => {
    expect(lineTotal(20, 50000, 0)).toBe(1000000);
    expect(lineTotal(2, 250000, 50000)).toBe(450000);
    const money = documentTotals([
      { quantity: 20, unitPrice: 50000, discount: 0 },
      { quantity: 20, unitPrice: 120000, discount: 0 }
    ]);
    expect(money.total).toBe(3400000);
    expect(money.subtotal + money.iva).toBe(money.total);
  });

  it('parte IVA incluido al 19%', () => {
    const money = splitIvaIncluded(119000);
    expect(money.subtotal).toBe(100000);
    expect(money.iva).toBe(19000);
  });
});
