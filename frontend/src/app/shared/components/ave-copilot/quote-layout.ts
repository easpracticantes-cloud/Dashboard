/**
 * Geometría de los campos rellenables sobre la plantilla oficial
 * `assets/brand/plantilla-cotizacion.jpg` (682 × 1024 px).
 *
 * Cada caja cubre únicamente la zona del texto `[placeholder]` impreso en el
 * JPG, con el color de fondo muestreado de la propia imagen para que el parche
 * sea invisible. Las mismas cajas alimentan la vista editable y el PDF.
 */

export const SHEET_W = 682;
export const SHEET_H = 1024;

export interface FieldBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FieldAlign = 'left' | 'center' | 'right';

/** Colores muestreados del JPG en cada zona (ver `_calib` en el historial). */
export const SHEET_TINT = {
  meta: '#ecf3ea',
  client: '#fdfdfd',
  rowOdd: '#fdfefe',
  rowEven: '#f0f6f3',
  subtotal: '#ecf3eb',
  iva: '#ebf3ea',
  grand: '#046445',
  pay: '#fafbfb'
} as const;

export const SHEET_INK = {
  body: '#1f2d25',
  grand: '#ffffff'
} as const;

export type MetaKey = 'quoteNumber' | 'issuedAt' | 'validUntil';
export type ClientKey = 'clientName' | 'clientNit' | 'clientPhone' | 'clientEmail' | 'clientCity';
export type PayKey = 'commercialConditions';
export type TextKey = MetaKey | ClientKey | PayKey;

export interface TextFieldSpec {
  key: TextKey;
  box: FieldBox;
  tint: string;
  align: FieldAlign;
  kind: 'text' | 'date' | 'email' | 'tel';
  label: string;
  fs: number;
}

/** Bloque "N.º Cotización / Fecha de emisión / Válida hasta". */
export const META_FIELDS: readonly TextFieldSpec[] = [
  { key: 'quoteNumber', box: { x: 505, y: 223, w: 145, h: 17 }, tint: SHEET_TINT.meta, align: 'left', kind: 'text', label: 'N.º de cotización', fs: 9 },
  { key: 'issuedAt', box: { x: 505, y: 240, w: 145, h: 18 }, tint: SHEET_TINT.meta, align: 'left', kind: 'date', label: 'Fecha de emisión', fs: 9 },
  { key: 'validUntil', box: { x: 505, y: 258, w: 145, h: 17 }, tint: SHEET_TINT.meta, align: 'left', kind: 'date', label: 'Válida hasta', fs: 9 }
];

/** Tarjeta "Datos del cliente" (5 renglones, respetando los subrayados del JPG). */
export const CLIENT_FIELDS: readonly TextFieldSpec[] = [
  { key: 'clientName', box: { x: 105, y: 325, w: 235, h: 18 }, tint: SHEET_TINT.client, align: 'left', kind: 'text', label: 'Nombre del cliente', fs: 9 },
  { key: 'clientNit', box: { x: 105, y: 346, w: 235, h: 18 }, tint: SHEET_TINT.client, align: 'left', kind: 'text', label: 'NIT o C.C.', fs: 9 },
  { key: 'clientPhone', box: { x: 105, y: 368, w: 235, h: 18 }, tint: SHEET_TINT.client, align: 'left', kind: 'tel', label: 'Teléfono', fs: 9 },
  { key: 'clientEmail', box: { x: 105, y: 389, w: 235, h: 18 }, tint: SHEET_TINT.client, align: 'left', kind: 'email', label: 'Correo electrónico', fs: 9 },
  { key: 'clientCity', box: { x: 105, y: 410, w: 235, h: 18 }, tint: SHEET_TINT.client, align: 'left', kind: 'text', label: 'Ciudad', fs: 9 }
];

/** Placeholder "[Ej. 50% al confirmar la reserva…]" de la franja de condiciones. */
export const PAY_FIELDS: readonly TextFieldSpec[] = [
  { key: 'commercialConditions', box: { x: 121, y: 837, w: 270, h: 16 }, tint: SHEET_TINT.pay, align: 'left', kind: 'text', label: 'Forma de pago', fs: 8.5 }
];

export const QUOTE_MAX_ROWS = 5;

/** Borde superior de cada renglón de la tabla impresa. */
export const ROW_TOPS: readonly number[] = [502, 548, 593, 638, 683];
export const ROW_H = 45;

/** Celdas relativas al borde superior del renglón. */
export const ROW_CELLS = {
  description: { x: 92, dy: 7, w: 262, h: 32, align: 'left' as FieldAlign, fs: 8.2, lh: 15 },
  quantity: { x: 366, dy: 13, w: 76, h: 18, align: 'center' as FieldAlign, fs: 8.6, lh: 12 },
  unitPrice: { x: 449, dy: 13, w: 98, h: 18, align: 'center' as FieldAlign, fs: 8.6, lh: 12 },
  total: { x: 555, dy: 13, w: 96, h: 18, align: 'center' as FieldAlign, fs: 8.6, lh: 12 }
} as const;

export type RowCellKey = keyof typeof ROW_CELLS;

export function rowCellBox(rowIndex: number, cell: RowCellKey): FieldBox {
  const spec = ROW_CELLS[cell];
  return { x: spec.x, y: ROW_TOPS[rowIndex] + spec.dy, w: spec.w, h: spec.h };
}

export function rowTint(rowIndex: number): string {
  return rowIndex % 2 ? SHEET_TINT.rowEven : SHEET_TINT.rowOdd;
}

export interface TotalFieldSpec {
  key: 'subtotal' | 'iva' | 'grand';
  box: FieldBox;
  tint: string;
  ink: string;
  fs: number;
  bold: boolean;
}

export const TOTAL_FIELDS: readonly TotalFieldSpec[] = [
  { key: 'subtotal', box: { x: 530, y: 737, w: 118, h: 19 }, tint: SHEET_TINT.subtotal, ink: SHEET_INK.body, fs: 9, bold: false },
  { key: 'iva', box: { x: 530, y: 759, w: 118, h: 19 }, tint: SHEET_TINT.iva, ink: SHEET_INK.body, fs: 9, bold: false },
  { key: 'grand', box: { x: 520, y: 783, w: 130, h: 23 }, tint: SHEET_TINT.grand, ink: SHEET_INK.grand, fs: 13, bold: true }
];

export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Convierte una caja en px de la plantilla a porcentajes, para que escale. */
export function boxRect(box: FieldBox): BoxRect {
  return {
    left: (100 * box.x) / SHEET_W,
    top: (100 * box.y) / SHEET_H,
    width: (100 * box.w) / SHEET_W,
    height: (100 * box.h) / SHEET_H
  };
}

/** Tamaño de fuente en `cqw` para que el texto escale con el ancho de la hoja. */
export function fontCqw(px: number): number {
  return (100 * px) / SHEET_W;
}
