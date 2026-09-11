/** Cálculos de cotización en COP enteros. No usar floats para la lógica. */

export const IVA_RATE = 0.19;

export function cop(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

export function lineGross(quantity: unknown, unitPrice: unknown): number {
  return cop(cop(quantity) * cop(unitPrice));
}

export function lineTotal(quantity: unknown, unitPrice: unknown, discount: unknown = 0): number {
  return Math.max(0, lineGross(quantity, unitPrice) - cop(discount));
}

export function splitIvaIncluded(total: unknown): { subtotal: number; iva: number; total: number } {
  const rawTotal = Math.max(0, cop(total));
  const subtotal = Math.round(rawTotal / (1 + IVA_RATE));
  return { subtotal, iva: rawTotal - subtotal, total: rawTotal };
}

export function documentTotals(
  items: Array<{ quantity?: unknown; unitPrice?: unknown; discount?: unknown; total?: unknown }>
): { subtotal: number; iva: number; total: number } {
  const total = (items || []).reduce(
    (sum, item) => sum + lineTotal(item.quantity, item.unitPrice, item.discount),
    0
  );
  return splitIvaIncluded(total);
}
