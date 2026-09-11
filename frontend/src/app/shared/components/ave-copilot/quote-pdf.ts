/**
 * Llena la plantilla visual de Escuela Aves y descarga un PDF de esa hoja.
 */
import {
  QUOTE_TEMPLATE_BOXES,
  QUOTE_TEMPLATE_IMAGE,
  QUOTE_TEMPLATE_SIZE,
  fillQuoteTemplate,
  overlayValues,
  type QuoteTemplateInput
} from './quote-template';

export type QuotePdfData = QuoteTemplateInput;

export async function downloadQuotePdf(data: QuotePdfData): Promise<void> {
  const blob = await buildQuotePdfBlob(data);
  const code = (data.code || 'EAS').replace(/[^\w.-]+/g, '_');
  triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
}

export async function buildQuotePdfBlob(data: QuotePdfData): Promise<Blob> {
  const jpeg = await renderFilledTemplateJpeg(data);
  return jpegToPdf(jpeg.bytes, jpeg.width, jpeg.height);
}

async function renderFilledTemplateJpeg(data: QuotePdfData): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  const img = await loadImage(QUOTE_TEMPLATE_IMAGE);
  const scale = 2;
  const width = QUOTE_TEMPLATE_SIZE.width * scale;
  const height = QUOTE_TEMPLATE_SIZE.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo dibujar la plantilla');
  }
  ctx.drawImage(img, 0, 0, width, height);
  const filled = fillQuoteTemplate(data);
  const values = overlayValues(filled);
  ctx.textBaseline = 'middle';
  for (const box of QUOTE_TEMPLATE_BOXES) {
    const text = (values[box.id] || '').trim();
    const x = (box.x / 100) * width;
    const y = (box.y / 100) * height;
    const w = (box.w / 100) * width;
    const h = (box.h / 100) * height;
    ctx.fillStyle = box.color?.startsWith('#f') ? 'rgba(11, 42, 26, 0.92)' : '#ffffff';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    if (!text) {
      continue;
    }
    const fontPx = ((box.font || 1.4) / 100) * width;
    ctx.fillStyle = box.color || '#1a2c22';
    ctx.font = `${box.weight || 500} ${fontPx}px "Segoe UI", Calibri, Arial, sans-serif`;
    ctx.textAlign = box.align || 'left';
    const tx =
      box.align === 'right' ? x + w - 2 : box.align === 'center' ? x + w / 2 : x + 2;
    const ty = y + h / 2;
    fillWrapped(ctx, text, tx, ty, w - 4, fontPx * 1.15, box.align || 'left');
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('No se pudo exportar la plantilla'))),
      'image/jpeg',
      0.93
    );
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

function fillWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: 'left' | 'right' | 'center'
): void {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let row = '';
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && row) {
      lines.push(row);
      row = word;
    } else {
      row = next;
    }
  }
  if (row) {
    lines.push(row);
  }
  const use = lines.slice(0, 3);
  const startY = y - ((use.length - 1) * lineHeight) / 2;
  use.forEach((line, i) => {
    ctx.textAlign = align;
    ctx.fillText(line, x, startY + i * lineHeight, maxWidth);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se encontró la plantilla de cotización'));
    img.src = src;
  });
}

function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const pageW = 595;
  const pageH = Math.round((pageW * imgH) / imgW);
  const objects: Uint8Array[] = [];
  objects.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  objects.push(ascii('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));
  objects.push(
    ascii(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    )
  );
  objects.push(
    concat(
      ascii(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
      ),
      jpeg,
      ascii('\nendstream\nendobj\n')
    )
  );
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  objects.push(
    ascii(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
  );

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
