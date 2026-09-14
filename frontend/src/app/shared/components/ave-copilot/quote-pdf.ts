/**
 * PDF = JPG oficial + valores en coordenadas calibradas (682×1024).
 */
import { documentToDraft } from './quote-sheet.model';
import type { QuoteSheetDocument } from './quote-sheet.model';
import {
  QUOTE_TEMPLATE_IMAGE,
  fillQuoteTemplate,
  type FilledQuoteTemplate,
  type QuoteLineItem,
  type QuoteTemplateInput
} from './quote-template';

export type QuotePdfData = QuoteTemplateInput | QuoteSheetDocument;

const MAX_ROWS = 5;
const PANEL = '#eef3ec';
const INK = '#1a2c22';

export async function downloadQuotePdf(data: QuotePdfData): Promise<void> {
  const blob = await buildQuotePdfBlob(data);
  const code = (('code' in data && data.code) || ('quoteNumber' in data && data.quoteNumber) || 'EAS')
    .toString()
    .replace(/[^\w.-]+/g, '_');
  triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
}

export async function buildQuotePdfBlob(data: QuotePdfData): Promise<Blob> {
  const filled = fillQuoteTemplate(toInput(data));
  const plantilla = await loadImage(QUOTE_TEMPLATE_IMAGE);
  const page = await renderOnPlantilla(filled, plantilla);
  return jpegPagesToPdf([page]);
}

function toInput(data: QuotePdfData): QuoteTemplateInput {
  const doc = data as QuoteSheetDocument;
  if (doc && Array.isArray(doc.items) && doc.items[0] && 'id' in doc.items[0]) {
    return documentToDraft(doc);
  }
  return data as QuoteTemplateInput;
}

async function renderOnPlantilla(
  filled: FilledQuoteTemplate,
  plantilla: HTMLImageElement
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const width = plantilla.naturalWidth || plantilla.width;
  const height = plantilla.naturalHeight || plantilla.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo dibujar la cotización');
  }

  ctx.drawImage(plantilla, 0, 0, width, height);

  const x = (pct: number) => (pct / 100) * width;
  const y = (pct: number) => (pct / 100) * height;

  const cover = (px: number, py: number, pw: number, ph: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
  };

  // Meta
  cover(x(74.5), y(21.5), x(21.5), y(6.2), PANEL);
  write(ctx, clean(filled.quoteNumber), x(74.7), y(21.7), x(21), 12, INK, 'left');
  write(ctx, clean(filled.issuedAt), x(74.7), y(23.7), x(21), 12, INK, 'left');
  write(ctx, clean(filled.validUntil), x(74.7), y(25.7), x(21), 12, INK, 'left');

  // Cliente
  cover(x(15.8), y(32.6), x(28.5), y(11.8), PANEL);
  const client = [
    clean(filled.clientName),
    clean(filled.clientNit),
    clean(filled.clientPhone),
    clean(filled.clientEmail),
    clean(filled.clientCity)
  ];
  client.forEach((line, i) => write(ctx, line, x(16), y(33 + i * 2.15), x(27.5), 12, INK, 'left'));

  // Filas
  const rowTops = [50.1, 54.5, 58.9, 63.3, 67.8];
  const rows = filled.items.slice(0, MAX_ROWS);
  rowTops.forEach((top, i) => {
    const row = rows[i];
    const band = y(top);
    const h = y(3.6);
    const bg = i % 2 === 1 ? '#f2f7f3' : '#ffffff';
    cover(x(14.7), band, x(81.7), h, bg);
    if (!row) {
      return;
    }
    write(ctx, clean(row.description), x(14.9), band + y(0.35), x(39.5), 11, INK, 'left', true);
    write(ctx, qty(row), x(56.5), band + y(0.6), x(11.5), 11, INK, 'right');
    write(ctx, clean(row.unitPrice), x(69.2), band + y(0.6), x(14.5), 11, INK, 'right');
    write(ctx, clean(row.total), x(84.9), band + y(0.6), x(11.5), 11, INK, 'right');
  });

  // Totales
  cover(x(78), y(72.2), x(17.5), y(5.8), PANEL);
  cover(x(78), y(76.6), x(17.5), y(2.1), '#0b3d28');
  if (filled.rawTotal > 0) {
    write(ctx, filled.subtotal, x(78.2), y(72.5), x(17), 12, INK, 'right');
    write(ctx, filled.iva, x(78.2), y(74.4), x(17), 12, INK, 'right');
    write(ctx, filled.total, x(78.2), y(76.9), x(17), 13, '#f6efe2', 'right');
  }

  return { bytes: await canvasToJpeg(canvas), width, height };
}

function qty(row: QuoteLineItem): string {
  if (!row.quantity) {
    return '';
  }
  return row.unit ? `${row.quantity} ${row.unit}` : row.quantity;
}

function clean(value?: string): string {
  const v = (value || '').trim();
  return !v || v === '—' ? '' : v;
}

function write(
  ctx: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
  maxWidth: number,
  size: number,
  color: string,
  align: CanvasTextAlign,
  wrap = false
): void {
  if (!text) {
    return;
  }
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "Segoe UI", Calibri, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const drawX = align === 'right' ? left + maxWidth : left;
  if (!wrap || ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, drawX, top, maxWidth);
    return;
  }
  const words = text.split(/\s+/);
  let line = '';
  let row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, drawX, top + row * (size + 2), maxWidth);
      line = word;
      row += 1;
      if (row >= 2) {
        return;
      }
    } else {
      line = next;
    }
  }
  if (line && row < 2) {
    ctx.fillText(line, drawX, top + row * (size + 2), maxWidth);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se encontró la plantilla de cotización'));
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('No se pudo generar la imagen PDF'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      0.94
    );
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
    nextId += 3;
  }
  let kids = '';
  for (const id of pageObjIds) {
    kids += `${id} 0 R `;
  }
  objects.push(ascii(`2 0 obj\n<< /Type /Pages /Kids [ ${kids}] /Count ${pages.length} >>\nendobj\n`));
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageId = pageObjIds[i];
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const pageH = Math.round((page.height / page.width) * pageW);
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im${i} Do\nQ\n`;
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
    objects.push(
      ascii(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
    );
  }
  let body = new Uint8Array(0);
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body = concat(body, obj) as Uint8Array<ArrayBuffer>;
  }
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const pdfBytes = concat(body, ascii(xref), ascii(trailer)) as Uint8Array<ArrayBuffer>;
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
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
  a.click();
  URL.revokeObjectURL(url);
}
