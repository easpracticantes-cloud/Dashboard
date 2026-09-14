/**
 * PDF de cotización Escuela Aves Salento.
 *
 * Dibuja la plantilla oficial `plantilla-cotizacion.jpg` a tamaño completo y
 * después tapa **solo** las zonas de `[placeholder]` que tienen valor, pintando
 * el texto encima con la misma tipografía y tinta que la vista editable.
 * No se reconstruye ningún layout: la imagen es el documento.
 */
import {
  CLIENT_FIELDS,
  META_FIELDS,
  PAY_FIELDS,
  QUOTE_MAX_ROWS,
  ROW_CELLS,
  SHEET_H,
  SHEET_INK,
  SHEET_W,
  TOTAL_FIELDS,
  rowCellBox,
  rowTint,
  type FieldAlign,
  type FieldBox
} from './quote-layout';
import { documentToDraft } from './quote-sheet.model';
import type { QuoteSheetDocument } from './quote-sheet.model';
import {
  QUOTE_TEMPLATE_IMAGE,
  fillQuoteTemplate,
  type QuoteTemplateInput
} from './quote-template';

export type QuotePdfData = QuoteTemplateInput | QuoteSheetDocument;

/** Se renderiza a 2× la plantilla para que el texto salga nítido. */
const SCALE = 2;
const FONT_STACK = '"Segoe UI", Calibri, Candara, Arial, sans-serif';
const PAD = 2;

export async function downloadQuotePdf(data: QuotePdfData): Promise<void> {
  const blob = await buildQuotePdfBlob(data);
  const code = (('code' in data && data.code) || ('quoteNumber' in data && data.quoteNumber) || 'EAS')
    .toString()
    .replace(/[^\w.-]+/g, '_');
  triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
}

export async function buildQuotePdfBlob(data: QuotePdfData): Promise<Blob> {
  const values = resolveValues(data);
  const plantilla = await loadImage(QUOTE_TEMPLATE_IMAGE);
  const page = await renderSheet(values, plantilla);
  return jpegPagesToPdf([page]);
}

interface SheetRowValues {
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

interface SheetValues {
  text: Record<string, string>;
  rows: SheetRowValues[];
  subtotal: string;
  iva: string;
  grand: string;
  hasMoney: boolean;
}

function resolveValues(data: QuotePdfData): SheetValues {
  const input = toInput(data);
  const filled = fillQuoteTemplate(input);
  const rows = filled.items.slice(0, QUOTE_MAX_ROWS).map((item) => ({
    description: item.description || '',
    quantity: item.quantity ? [item.quantity, item.unit].filter(Boolean).join(' ') : '',
    unitPrice: item.unitPrice || '',
    total: item.total || ''
  }));
  while (rows.length < QUOTE_MAX_ROWS) {
    rows.push({ description: '', quantity: '', unitPrice: '', total: '' });
  }
  return {
    text: {
      quoteNumber: undash(filled.quoteNumber),
      issuedAt: undash(filled.issuedAt),
      validUntil: undash(filled.validUntil),
      clientName: undash(filled.clientName),
      clientNit: undash(filled.clientNit),
      clientPhone: undash(filled.clientPhone),
      clientEmail: undash(filled.clientEmail),
      clientCity: undash(filled.clientCity),
      commercialConditions: undash(input.commercialConditions)
    },
    rows,
    subtotal: filled.subtotal,
    iva: filled.iva,
    grand: filled.total,
    hasMoney: filled.rawTotal > 0
  };
}

function toInput(data: QuotePdfData): QuoteTemplateInput {
  const doc = data as QuoteSheetDocument;
  if (doc && Array.isArray(doc.items) && doc.items[0] && 'id' in doc.items[0]) {
    return documentToDraft(doc);
  }
  return data as QuoteTemplateInput;
}

async function renderSheet(
  values: SheetValues,
  plantilla: HTMLImageElement
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const width = SHEET_W * SCALE;
  const height = SHEET_H * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo dibujar la cotización');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(plantilla, 0, 0, width, height);
  ctx.textBaseline = 'middle';

  for (const spec of [...META_FIELDS, ...CLIENT_FIELDS, ...PAY_FIELDS]) {
    const text = values.text[spec.key];
    if (!text) {
      continue;
    }
    cover(ctx, spec.box, spec.tint);
    paint(ctx, text, spec.box, {
      align: spec.align,
      fs: spec.fs,
      weight: 600,
      ink: SHEET_INK.body
    });
  }

  // La tabla se tapa completa o no se toca: dejar "[Descripción del servicio…]"
  // en los renglones sobrantes se vería roto junto a un ítem real.
  if (values.rows.some((row) => row.description || row.unitPrice || row.total)) {
    values.rows.forEach((row, index) => {
      const tint = rowTint(index);
      const descBox = rowCellBox(index, 'description');
      cover(ctx, descBox, tint);
      if (row.description) {
        paintDescription(ctx, row.description, descBox);
      }
      paintCell(ctx, row.quantity, index, 'quantity', tint, 600);
      paintCell(ctx, row.unitPrice, index, 'unitPrice', tint, 600);
      paintCell(ctx, row.total, index, 'total', tint, 700);
    });
  }

  if (values.hasMoney) {
    const money: Record<string, string> = {
      subtotal: values.subtotal,
      iva: values.iva,
      grand: values.grand
    };
    for (const spec of TOTAL_FIELDS) {
      cover(ctx, spec.box, spec.tint);
      paint(ctx, money[spec.key], spec.box, {
        align: 'right',
        fs: spec.fs,
        weight: spec.bold ? 800 : 600,
        ink: spec.ink
      });
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('No se pudo exportar la cotización'))),
      'image/jpeg',
      0.95
    );
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

function paintCell(
  ctx: CanvasRenderingContext2D,
  text: string,
  index: number,
  key: 'quantity' | 'unitPrice' | 'total',
  tint: string,
  weight: number
): void {
  const spec = ROW_CELLS[key];
  const box = rowCellBox(index, key);
  cover(ctx, box, tint);
  if (text) {
    paint(ctx, text, box, { align: spec.align, fs: spec.fs, weight, ink: SHEET_INK.body });
  }
}

/** Tapa la zona del placeholder con el color de fondo local de la plantilla. */
function cover(ctx: CanvasRenderingContext2D, box: FieldBox, tint: string): void {
  ctx.fillStyle = tint;
  ctx.fillRect(box.x * SCALE, box.y * SCALE, box.w * SCALE, box.h * SCALE);
}

interface PaintOpts {
  align: FieldAlign;
  fs: number;
  weight: number;
  ink: string;
}

function paint(ctx: CanvasRenderingContext2D, text: string, box: FieldBox, opts: PaintOpts): void {
  const maxWidth = (box.w - PAD * 2) * SCALE;
  const size = fitFont(ctx, text, maxWidth, opts.fs, opts.weight);
  ctx.fillStyle = opts.ink;
  ctx.font = font(size, opts.weight);
  ctx.textAlign = opts.align === 'left' ? 'left' : opts.align === 'right' ? 'right' : 'center';
  const x =
    opts.align === 'left'
      ? (box.x + PAD) * SCALE
      : opts.align === 'right'
        ? (box.x + box.w - PAD) * SCALE
        : (box.x + box.w / 2) * SCALE;
  ctx.fillText(ellipsize(ctx, text, maxWidth), x, (box.y + box.h / 2) * SCALE, maxWidth);
  ctx.textAlign = 'left';
}

/** La descripción usa los dos renglones que la plantilla ya tiene impresos. */
function paintDescription(ctx: CanvasRenderingContext2D, text: string, box: FieldBox): void {
  const spec = ROW_CELLS.description;
  const maxWidth = (box.w - PAD * 2) * SCALE;
  const size = spec.fs;
  ctx.font = font(size, 500);
  const lines = wrap(ctx, text.replace(/\s*\n\s*/g, ' '), maxWidth, 2);
  ctx.fillStyle = SHEET_INK.body;
  ctx.textAlign = 'left';
  const x = (box.x + PAD) * SCALE;
  // Los dos renglones caen exactamente donde la plantilla los tiene impresos.
  const centers = [box.y + 8.5, box.y + 8.5 + spec.lh];
  lines.forEach((line, i) => {
    ctx.fillText(i === lines.length - 1 ? ellipsize(ctx, line, maxWidth) : line, x, centers[i] * SCALE, maxWidth);
  });
}

function font(sizePx: number, weight: number): string {
  return `${weight} ${(sizePx * SCALE).toFixed(2)}px ${FONT_STACK}`;
}

/** Reduce un poco la fuente antes de recortar, como haría el navegador. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  base: number,
  weight: number
): number {
  let size = base;
  for (let i = 0; i < 6; i++) {
    ctx.font = font(size, weight);
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= base * 0.06;
  }
  return size;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let row = '';
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && row) {
      lines.push(row);
      row = word;
      if (lines.length === maxLines) {
        break;
      }
    } else {
      row = next;
    }
  }
  if (lines.length < maxLines && row) {
    lines.push(row);
  }
  return lines.length ? lines : [''];
}

function undash(value?: string): string {
  const text = (value || '').trim();
  return text === '—' ? '' : text;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se encontró la plantilla de cotización'));
    img.src = src;
  });
}

function jpegPagesToPdf(pages: Array<{ bytes: Uint8Array; width: number; height: number }>): Blob {
  const pageW = 595;
  const objects: Uint8Array[] = [];
  objects.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  const pageObjIds: number[] = [];
  let nextId = 3;
  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(nextId);
    nextId += 3; // page, image, content
  }
  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  objects.push(ascii(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageH = Math.round((pageW * page.height) / page.width);
    const pageId = pageObjIds[i];
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    objects.push(
      ascii(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
      )
    );
    objects.push(
      concat(
        ascii(
          `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
        ),
        page.bytes,
        ascii('\nendstream\nendobj\n')
      )
    );
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im${i} Do Q`;
    objects.push(ascii(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));
  }

  let body = ascii('%PDF-1.4\n');
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body = concat(body, obj);
  }
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([concat(body, ascii(xref)) as BlobPart], { type: 'application/pdf' });
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
