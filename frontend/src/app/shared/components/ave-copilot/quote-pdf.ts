/**
 * PDF de cotización Escuela Aves Salento.
 * Dibuja la plantilla con formas + texto + assets (logo/foto decorativa).
 * Multipágina: mismos colores, tipografía, header y footer; totales solo al final.
 */
import { documentToDraft } from './quote-sheet.model';
import type { QuoteSheetDocument } from './quote-sheet.model';
import {
  ESCUELA_AVES_COMPANY,
  QUOTE_HERO_BIRD,
  QUOTE_LOGO,
  QUOTE_TEMPLATE_IMAGE,
  fillQuoteTemplate,
  type FilledQuoteTemplate,
  type QuoteLineItem,
  type QuoteTemplateInput
} from './quote-template';

export type QuotePdfData = QuoteTemplateInput | QuoteSheetDocument;

const PAGE_W = 794;
const PAGE_H = 1123;
const ROWS_PER_PAGE = 6;

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
  const items = filled.items.length
    ? filled.items
    : [
        {
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
        } as QuoteLineItem
      ];

  const chunks: QuoteLineItem[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
    chunks.push(items.slice(i, i + ROWS_PER_PAGE));
  }
  if (!chunks.length) {
    chunks.push([]);
  }

  const [plantilla, logo, bird] = await Promise.all([
    loadImage(QUOTE_TEMPLATE_IMAGE).catch(() => null),
    loadImage(QUOTE_LOGO).catch(() => null),
    loadImage(QUOTE_HERO_BIRD).catch(() => null)
  ]);

  const pages: Array<{ bytes: Uint8Array; width: number; height: number }> = [];
  for (let p = 0; p < chunks.length; p++) {
    pages.push(
      await renderPage({
        filled,
        rows: chunks[p],
        pageIndex: p,
        pageCount: chunks.length,
        itemOffset: p * ROWS_PER_PAGE,
        plantilla,
        logo,
        bird
      })
    );
  }
  return jpegPagesToPdf(pages);
}

function toInput(data: QuotePdfData): QuoteTemplateInput {
  const doc = data as QuoteSheetDocument;
  if (doc && Array.isArray(doc.items) && doc.items[0] && 'id' in doc.items[0]) {
    return documentToDraft(doc);
  }
  return data as QuoteTemplateInput;
}

async function renderPage(opts: {
  filled: FilledQuoteTemplate;
  rows: QuoteLineItem[];
  pageIndex: number;
  pageCount: number;
  itemOffset: number;
  plantilla: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  bird: HTMLImageElement | null;
}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { filled, rows, pageIndex, pageCount, itemOffset, plantilla, logo, bird } = opts;
  const width = PAGE_W;
  const height = PAGE_H;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo dibujar la cotización');
  }
  const company = ESCUELA_AVES_COMPANY;
  const isLast = pageIndex === pageCount - 1;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header (identidad protegida)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, 188);
  ctx.fillStyle = '#0b3d28';
  ctx.fillRect(width * 0.62, 0, width * 0.38, 188);
  if (bird) {
    drawCover(ctx, bird, width * 0.38, 0, width * 0.36, 188);
  } else if (plantilla) {
    ctx.drawImage(plantilla, 290, 40, 360, 280, width * 0.38, 0, width * 0.36, 188);
  }
  if (logo) {
    ctx.drawImage(logo, 36, 36, 176, 92);
  } else {
    ctx.fillStyle = '#0b3d28';
    ctx.font = '700 22px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillText('escuelaaves', 40, 80);
  }
  ctx.fillStyle = '#5a6b60';
  ctx.font = 'italic 13px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('Naturaleza que inspira', 40, 148);

  const gold = ctx.createLinearGradient(0, 188, width, 196);
  gold.addColorStop(0, '#b8922a');
  gold.addColorStop(0.5, '#c9a227');
  gold.addColorStop(1, '#e0c36a');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 188, width, 8);

  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 28px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText(pageIndex === 0 ? 'COTIZACIÓN' : 'COTIZACIÓN (continuación)', 48, 236);
  ctx.fillStyle = '#5a6b60';
  ctx.font = '400 13px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText(company.tagline, 48, 256);
  if (pageCount > 1) {
    ctx.fillText(`Página ${pageIndex + 1} de ${pageCount}`, 48, 274);
  }

  ctx.textAlign = 'left';
  drawMeta(ctx, width - 280, 220, 'N.º Cotización:', filled.quoteNumber);
  drawMeta(ctx, width - 280, 242, 'Fecha de emisión:', filled.issuedAt);
  drawMeta(ctx, width - 280, 264, 'Válida hasta:', filled.validUntil);

  let tableTop = 300;
  if (pageIndex === 0) {
    ctx.font = '800 15px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillStyle = '#0b3d28';
    ctx.fillText('Datos del cliente', 48, 300);
    ctx.fillText('Nuestra información', width / 2 + 10, 300);
    const clientY = 322;
    if (filled.clientName) drawKv(ctx, 48, clientY, 'Nombre:', filled.clientName);
    if (filled.clientNit) drawKv(ctx, 48, clientY + 22, 'NIT / C.C.:', filled.clientNit);
    if (filled.clientPhone) drawKv(ctx, 48, clientY + 44, 'Teléfono:', filled.clientPhone);
    if (filled.clientEmail) drawKv(ctx, 48, clientY + 66, 'Correo:', filled.clientEmail);
    if (filled.clientCity) drawKv(ctx, 48, clientY + 88, 'Ciudad:', filled.clientCity);

    ctx.font = '800 13px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillStyle = '#0b3d28';
    ctx.fillText(company.legalName, width / 2 + 10, clientY);
    ctx.font = '400 12px "Segoe UI", Calibri, Arial, sans-serif';
    drawKv(ctx, width / 2 + 10, clientY + 22, 'NIT:', company.nit);
    drawKv(ctx, width / 2 + 10, clientY + 44, 'Dirección:', company.address);
    drawKv(ctx, width / 2 + 10, clientY + 66, 'Teléfono:', company.phone);
    drawKv(ctx, width / 2 + 10, clientY + 88, 'Correo:', company.email);
    tableTop = 450;
  }

  ctx.fillStyle = '#0b3d28';
  ctx.font = '800 15px "Segoe UI", Calibri, Arial, sans-serif';
  ctx.fillText('Detalle de la cotización', 48, tableTop);
  const cols = [
    { x: 48, title: 'Ítem' },
    { x: 98, title: 'Descripción' },
    { x: 398, title: 'Cantidad' },
    { x: 488, title: 'Valor unitario' },
    { x: 608, title: 'Valor total' }
  ];
  ctx.fillStyle = '#0b3d28';
  ctx.fillRect(48, tableTop + 10, width - 96, 28);
  ctx.fillStyle = '#f6efe2';
  ctx.font = '700 11px "Segoe UI", Calibri, Arial, sans-serif';
  cols.forEach((col) => ctx.fillText(col.title, col.x + 8, tableTop + 28));

  const displayRows = [...rows];
  while (displayRows.length < Math.min(ROWS_PER_PAGE, 5) && pageIndex === 0 && pageCount === 1) {
    displayRows.push({
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

  displayRows.forEach((item, i) => {
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
    ctx.fillText(String(itemOffset + i + 1), 73, y + 25);
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

  let cursorY = tableTop + 38 + displayRows.length * 42 + 24;

  if (isLast) {
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
      ctx.fillText(text, 48 + col * 200, cursorY + row * 20);
    });

    ctx.font = '700 12px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillStyle = '#5a6b60';
    ctx.textAlign = 'right';
    ctx.fillText('Subtotal', 620, cursorY);
    ctx.fillText('IVA (19%)', 620, cursorY + 20);
    ctx.fillStyle = '#1a2c22';
    ctx.fillText(filled.subtotal, 738, cursorY);
    ctx.fillText(filled.iva, 738, cursorY + 20);
    ctx.strokeStyle = '#0b3d28';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(560, cursorY + 28);
    ctx.lineTo(738, cursorY + 28);
    ctx.stroke();
    ctx.fillStyle = '#0b3d28';
    ctx.font = '800 16px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillText('Total', 620, cursorY + 48);
    ctx.fillText(filled.total, 738, cursorY + 48);
    ctx.textAlign = 'left';

    const payY = cursorY + 78;
    ctx.fillStyle = '#0b3d28';
    ctx.font = '800 14px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillText('Condiciones y forma de pago', 48, payY);
    ctx.font = '400 11px "Segoe UI", Calibri, Arial, sans-serif';
    ctx.fillStyle = '#1a2c22';
    const paymentLines = [...company.payment];
    paymentLines.slice(0, 6).forEach((line, i) => {
      ctx.fillText(`• ${line.replace(/^•\s*/, '')}`, 48, payY + 20 + i * 16);
    });
  }

  // Footer protegido
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
  lines.slice(0, 3).forEach((line, i) => {
    ctx.textAlign = align;
    ctx.fillText(line, x, y + i * lineHeight, maxWidth);
  });
  ctx.textAlign = 'left';
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = Math.max(0, (img.width - sw) / 2);
  const sy = Math.max(0, (img.height - sh) * 0.35);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se encontró un recurso de la plantilla'));
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
