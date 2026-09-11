/**
 * Genera un PDF dibujando la plantilla (formas + texto + fotos decorativas).
 * No usa la plantilla como fondo ni captura el navegador.
 */
import { documentToDraft } from './quote-sheet.model';
import type { QuoteSheetDocument } from './quote-sheet.model';
import {
  ESCUELA_AVES_COMPANY,
  QUOTE_LOGO,
  QUOTE_TEMPLATE_IMAGE,
  fillQuoteTemplate,
  type QuoteTemplateInput
} from './quote-template';

export type QuotePdfData = QuoteTemplateInput | QuoteSheetDocument;

export async function downloadQuotePdf(data: QuotePdfData): Promise<void> {
  const blob = await buildQuotePdfBlob(data);
  const code = (('code' in data && data.code) || ('quoteNumber' in data && data.quoteNumber) || 'EAS')
    .toString()
    .replace(/[^\w.-]+/g, '_');
  triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
}

export async function buildQuotePdfBlob(data: QuotePdfData): Promise<Blob> {
  const jpeg = await renderQuoteDocumentJpeg(toInput(data));
  return jpegToPdf(jpeg.bytes, jpeg.width, jpeg.height);
}

function toInput(data: QuotePdfData): QuoteTemplateInput {
  const doc = data as QuoteSheetDocument;
  if (doc && Array.isArray(doc.items) && doc.items[0] && 'id' in doc.items[0]) {
    return documentToDraft(doc);
  }
  return data as QuoteTemplateInput;
}

async function renderQuoteDocumentJpeg(data: QuoteTemplateInput): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  const width = 794;
  const height = 1123;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo dibujar la cotización');
  }

  const filled = fillQuoteTemplate(data);
  const company = ESCUELA_AVES_COMPANY;
  const [plantilla, logo] = await Promise.all([
    loadImage(QUOTE_TEMPLATE_IMAGE).catch(() => null),
    loadImage(QUOTE_LOGO).catch(() => null)
  ]);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, 188);
  ctx.fillStyle = '#0b3d28';
  ctx.fillRect(width * 0.62, 0, width * 0.38, 188);
  if (plantilla) {
    ctx.drawImage(plantilla, 290, 40, 360, 280, width * 0.38, 0, width * 0.36, 188);
  }
  if (logo) {
    ctx.drawImage(logo, 36, 36, 176, 92);
  } else {
    ctx.fillStyle = '#0b3d28';
    ctx.font = '700 22px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillText('escuelaaves', 40, 80);
    ctx.font = '600 16px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillText('Salento', 40, 104);
  }
  ctx.fillStyle = '#5a6b60';
  ctx.font = 'italic 13px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('Naturaleza que inspira', 40, 148);

  ctx.fillStyle = '#f6efe2';
  ctx.font = '600 13px "Segoe UI", Calibri, Arial, sans-serif';
  const pills = ['Avistamiento de aves', 'Experiencias naturales', 'Conexión con la biodiversidad'];
  pills.forEach((text, i) => {
    ctx.fillText(text, width * 0.66, 58 + i * 40);
  });

  const gold = ctx.createLinearGradient(0, 188, width, 196);
  gold.addColorStop(0, '#b8922a');
  gold.addColorStop(0.5, '#c9a227');
  gold.addColorStop(1, '#e0c36a');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 188, width, 8);

  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 28px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('COTIZACIÓN', 48, 236);
  ctx.fillStyle = '#5a6b60';
  ctx.font = '400 13px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText(company.tagline, 48, 256);

  ctx.textAlign = 'left';
  drawMeta(ctx, width - 280, 220, 'N.º Cotización:', filled.quoteNumber);
  drawMeta(ctx, width - 280, 242, 'Fecha de emisión:', filled.issuedAt);
  drawMeta(ctx, width - 280, 264, 'Válida hasta:', filled.validUntil);

  ctx.font = '800 15px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#0b3d28';
  ctx.fillText('Datos del cliente', 48, 300);
  ctx.fillText('Nuestra información', width / 2 + 10, 300);

  const clientY = 322;
  drawKv(ctx, 48, clientY, 'Nombre:', filled.clientName);
  drawKv(ctx, 48, clientY + 22, 'NIT / C.C.:', filled.clientNit);
  drawKv(ctx, 48, clientY + 44, 'Teléfono:', filled.clientPhone);
  drawKv(ctx, 48, clientY + 66, 'Correo:', filled.clientEmail);
  drawKv(ctx, 48, clientY + 88, 'Ciudad:', filled.clientCity);

  ctx.font = '800 13px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#0b3d28';
  ctx.fillText(company.legalName, width / 2 + 10, clientY);
  ctx.font = '400 12px "Segoe UI", Calibri, Arial, sans-serif';
  drawKv(ctx, width / 2 + 10, clientY + 22, 'NIT:', company.nit);
  drawKv(ctx, width / 2 + 10, clientY + 44, 'Dirección:', company.address);
  drawKv(ctx, width / 2 + 10, clientY + 66, 'Teléfono:', company.phone);
  drawKv(ctx, width / 2 + 10, clientY + 88, 'Correo:', company.email);

  ctx.save();
  ctx.translate(width - 42, clientY + 70);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#c9a227';
  ctx.font = '700 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText(company.slogan, 0, 0);
  ctx.restore();

  const tableTop = 450;
  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 15px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('Detalle de la cotización', 48, tableTop);
  const cols = [
    { x: 48, w: 50, title: 'Ítem' },
    { x: 98, w: 300, title: 'Descripción' },
    { x: 398, w: 90, title: 'Cantidad' },
    { x: 488, w: 120, title: 'Valor unitario' },
    { x: 608, w: 138, title: 'Valor total' }
  ];
  ctx.fillStyle = '#0b3d28';
  ctx.fillRect(48, tableTop + 10, width - 96, 28);
  ctx.fillStyle = '#f6efe2';
  ctx.font = '700 11px "Segoe UI", Calibri, Arial, sans-serif';
  cols.forEach((col) => ctx.fillText(col.title, col.x + 8, tableTop + 28));

  const rows = [...filled.items];
  while (rows.length < 5) {
    rows.push({
      description: '',
      quantity: '',
      unit: '',
      unitPrice: '',
      discount: '',
      total: '',
      rawQuantity: 0,
      rawUnitPrice: 0,
      rawDiscount: 0,
      rawTotal: 0
    });
  }
  rows.slice(0, 8).forEach((item, i) => {
    const y = tableTop + 38 + i * 42;
    ctx.fillStyle = i % 2 ? '#f4f7f4' : '#ffffff';
    ctx.fillRect(48, y, width - 96, 42);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(73, y + 21, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 73, y + 25);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a2c22';
    ctx.font = '400 11px "Segoe UI", Calibri, Arial, sans-serif';
    fillWrapped(ctx, item.description || '—', 106, y + 16, 280, 13, 'left');
    ctx.textAlign = 'center';
    ctx.fillText(item.quantity || '—', 443, y + 25);
    ctx.textAlign = 'right';
    ctx.fillText(item.unitPrice || '—', 600, y + 25);
    ctx.font = '700 11px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillText(item.total || '—', 738, y + 25);
    ctx.textAlign = 'left';
  });

  const totalsY = tableTop + 38 + Math.min(rows.length, 8) * 42 + 24;
  const trust = [
    'Guías expertos en aviturismo',
    'Seguridad en todo el recorrido',
    'Experiencias sostenibles',
    'Atención personalizada'
  ];
  ctx.fillStyle = '#0b3d28';
  ctx.font = '700 11px "Segoe UI", Calibri, Arial, sans-serif';
  trust.forEach((text, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ctx.fillText(text, 48 + col * 200, totalsY + row * 20);
  });

  ctx.font = '700 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#5a6b60';
  ctx.textAlign = 'right';
  ctx.fillText('Subtotal', 620, totalsY);
  ctx.fillText('IVA (19%)', 620, totalsY + 20);
  ctx.fillStyle = '#1a2c22';
  ctx.fillText(filled.subtotal, 738, totalsY);
  ctx.fillText(filled.iva, 738, totalsY + 20);
  ctx.strokeStyle = '#0b3d28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(560, totalsY + 28);
  ctx.lineTo(738, totalsY + 28);
  ctx.stroke();
  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 16px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('Total', 620, totalsY + 48);
  ctx.fillText(filled.total, 738, totalsY + 48);
  ctx.textAlign = 'left';

  const payY = totalsY + 78;
  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 14px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('Condiciones y forma de pago', 48, payY);
  ctx.font = '400 11px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#1a2c22';
  company.payment.forEach((line, i) => {
    ctx.fillText(`• ${line}`, 48, payY + 20 + i * 16);
  });
  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 16px "Segoe UI", Calibri, Arial, sans-serif';
  fillWrapped(ctx, company.magic, 520, payY + 28, 220, 18, 'right');

  ctx.fillStyle = '#07261a';
  ctx.fillRect(0, height - 128, width, 36);
  ctx.fillStyle = '#f4efe4';
  ctx.font = '400 11px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText(company.phone, 48, height - 106);
  ctx.fillText(company.email, 250, height - 106);
  ctx.fillText(company.address, 520, height - 106);
  if (plantilla) {
    ctx.drawImage(plantilla, 0, 860, 682, 160, 0, height - 92, width, 92);
  } else {
    ctx.fillStyle = '#0b3d28';
    ctx.fillRect(0, height - 92, width, 92);
  }
  ctx.fillStyle = '#f6efe2';
  ctx.font = '700 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(company.footerLine, width - 24, height - 18);
  ctx.textAlign = 'left';

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('No se pudo exportar la cotización'))),
      'image/jpeg',
      0.94
    );
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

function drawMeta(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string): void {
  ctx.font = '700 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#0b3d28';
  ctx.fillText(label, x, y);
  ctx.font = '400 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#1a2c22';
  ctx.fillText(value || '—', x + 118, y);
}

function drawKv(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string): void {
  ctx.font = '700 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#0b3d28';
  ctx.fillText(label, x, y);
  ctx.font = '400 12px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillStyle = '#1a2c22';
  ctx.fillText(value || '—', x + 78, y);
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
  const words = (text || '—').split(/\s+/);
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
  use.forEach((line, i) => {
    ctx.textAlign = align;
    ctx.fillText(line, x, y + i * lineHeight, maxWidth);
  });
  ctx.textAlign = 'left';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se encontró un recurso de la plantilla'));
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
  objects.push(ascii(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));

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
