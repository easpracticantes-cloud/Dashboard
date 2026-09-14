/**
 * PDF = plantilla JPG oficial + valores dinámicos encima.
 * No redibuja el diseño: usa la imagen de marca tal cual.
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

export async function downloadQuotePdf(data: QuotePdfData): Promise<void> {
  const blob = await buildQuotePdfBlob(data);
  const code = (('code' in data && data.code) || ('quoteNumber' in data && data.quoteNumber) || 'EAS')
    .toString()
    .replace(/[^\w.-]+/g, '_');
  triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
}

export async function buildQuotePdfBlob(data: QuotePdfData): Promise<Blob> {
  const input = toInput(data);
  const filled = fillQuoteTemplate(input);
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

  const px = (pct: number) => (pct / 100) * width;
  const py = (pct: number) => (pct / 100) * height;

  // Cubrir datos de ejemplo de la JPG y pintar valores reales
  const cover = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  const panel = '#eef3ef';
  const ink = '#1a2c22';

  // Meta values
  cover(px(68.5), py(20.2), px(26), py(6.2), panel);
  drawText(ctx, filled.quoteNumber, px(69), py(21.5), px(24), 13, ink, 'left');
  drawText(ctx, filled.issuedAt, px(69), py(23.6), px(24), 13, ink, 'left');
  drawText(ctx, filled.validUntil, px(69), py(25.7), px(24), 13, ink, 'left');

  // Cliente
  cover(px(13.5), py(31.6), px(30), py(11.5), panel);
  const clientLines = [
    filled.clientName,
    filled.clientNit,
    filled.clientPhone,
    filled.clientEmail,
    filled.clientCity
  ];
  clientLines.forEach((line, i) => {
    drawText(ctx, dash(line), px(14), py(32.8 + i * 2.15), px(28), 12, ink, 'left');
  });

  // Filas
  cover(px(5.8), py(53.2), px(88.5), py(16.5), '#ffffff');
  const rows = filled.items.slice(0, MAX_ROWS);
  rows.forEach((row, i) => {
    const y = py(53.4 + i * 3.25);
    if (i % 2 === 1) {
      cover(px(5.8), y - py(0.3), px(88.5), py(3.2), '#f2f7f3');
    }
    drawText(ctx, row.description || '', px(12.5), y, px(40), 11, ink, 'left');
    drawText(ctx, qty(row), px(54), y, px(10), 11, ink, 'right');
    drawText(ctx, row.unitPrice || '', px(65), y, px(12), 11, ink, 'right');
    drawText(ctx, row.total || '', px(79), y, px(13), 11, ink, 'right');
  });

  // Totales
  cover(px(70), py(70.8), px(24), py(7.2), panel);
  cover(px(70), py(75.6), px(24), py(2.4), '#0b3d28');
  drawText(ctx, filled.subtotal, px(71), py(71.8), px(22), 12, ink, 'right');
  drawText(ctx, filled.iva, px(71), py(73.7), px(22), 12, ink, 'right');
  drawText(ctx, filled.total, px(71), py(76.4), px(22), 13, '#f6efe2', 'right');

  const bytes = await canvasToJpeg(canvas);
  return { bytes, width, height };
}

function qty(row: QuoteLineItem): string {
  if (!row.quantity) {
    return '';
  }
  return row.unit ? `${row.quantity} ${row.unit}` : row.quantity;
}

function dash(value: string): string {
  const v = (value || '').trim();
  return !v || v === '—' ? '' : v;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: string,
  align: CanvasTextAlign
): void {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "Segoe UI", Calibri, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const drawX = align === 'right' ? x + maxWidth : x;
  const value = String(text || '');
  if (!value) {
    return;
  }
  // wrap description a 2 líneas
  if (align === 'left' && ctx.measureText(value).width > maxWidth) {
    const words = value.split(/\s+/);
    let line = '';
    let row = 0;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        ctx.fillText(line, drawX, y + row * (size + 2), maxWidth);
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
      ctx.fillText(line, drawX, y + row * (size + 2), maxWidth);
    }
    return;
  }
  ctx.fillText(value, drawX, y, maxWidth);
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
      0.92
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
