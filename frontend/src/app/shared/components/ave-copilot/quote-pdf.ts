/**
 * Genera un PDF de texto simple (Latin-1) y lo descarga sin ventanas emergentes.
 * Suficiente para cotizaciones Ave sin dependencias extra.
 */

export interface QuotePdfData {
  code?: string;
  name?: string;
  modality?: string;
  people?: number;
  unitPrice?: number;
  total?: number;
  currency?: string;
  date?: string;
  pickup?: string;
  clientName?: string;
  notes?: string;
  includes?: string;
  excludes?: string;
  reviewFlag?: boolean;
}

export function downloadQuotePdf(data: QuotePdfData): void {
  const blob = buildQuotePdfBlob(data);
  const code = (data.code || 'EAS').replace(/[^\w.-]+/g, '_');
  const filename = `cotizacion-${code}-${stamp()}.pdf`;
  triggerDownload(blob, filename);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function money(n: number, currency = 'COP'): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(n || 0);
}

function buildQuotePdfBlob(data: QuotePdfData): Blob {
  const lines: string[] = [];
  lines.push('ESCUELA AVES SALENTO');
  lines.push('Cotizacion comercial - Kuara Expeditions');
  lines.push(`Fecha: ${new Date().toLocaleDateString('es-CO')}`);
  lines.push(`Codigo: ${data.code || '—'}`);
  lines.push('');
  lines.push(data.name || 'Tour');
  lines.push('');
  lines.push(`Cliente: ${data.clientName || 'Por confirmar'}`);
  lines.push(`Modalidad: ${data.modality || '—'}`);
  lines.push(`Personas: ${data.people ?? '—'}`);
  lines.push(`Fecha servicio: ${data.date || 'Por confirmar'}`);
  lines.push(`Pickup: ${data.pickup || 'Por confirmar'}`);
  lines.push(`Precio / persona: ${money(data.unitPrice || 0, data.currency || 'COP')}`);
  lines.push(`TOTAL: ${money(data.total || 0, data.currency || 'COP')}`);
  lines.push('');
  if (data.includes) {
    lines.push('Incluye:');
    wrapText(data.includes, 88).forEach((l) => lines.push(l));
    lines.push('');
  }
  if (data.excludes) {
    lines.push('No incluye:');
    wrapText(data.excludes, 88).forEach((l) => lines.push(l));
    lines.push('');
  }
  if (data.notes) {
    lines.push('Notas:');
    wrapText(data.notes, 88).forEach((l) => lines.push(l));
    lines.push('');
  }
  lines.push('Documento generado desde SIG - Ave.');
  if (data.reviewFlag) {
    lines.push('Tarifa marcada para revision comercial.');
  }

  return createTextPdf(lines);
}

function wrapText(text: string, max: number): string[] {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let row = '';
  for (const w of words) {
    const next = row ? `${row} ${w}` : w;
    if (next.length > max) {
      if (row) out.push(row);
      row = w;
    } else {
      row = next;
    }
  }
  if (row) out.push(row);
  return out.length ? out : [''];
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

/** PDF mínimo con Helvetica + WinAnsi (cubre español básico). */
function createTextPdf(lines: string[]): Blob {
  const pageWidth = 612; // letter
  const pageHeight = 792;
  const marginLeft = 50;
  const startY = 750;
  const lineHeight = 16;
  const fontSize = 11;

  const contentParts: string[] = [];
  contentParts.push('BT');
  contentParts.push('/F1 ' + fontSize + ' Tf');
  contentParts.push(`${marginLeft} ${startY} Td`);
  contentParts.push(`${lineHeight} TL`);

  lines.forEach((line, idx) => {
    const safe = pdfEscape(toWinAnsi(line));
    if (idx === 0) {
      contentParts.push(`(${safe}) Tj`);
    } else {
      contentParts.push('T*');
      contentParts.push(`(${safe}) Tj`);
    }
  });
  contentParts.push('ET');
  const stream = contentParts.join('\n');
  const streamBytes = latin1Bytes(stream);

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`
  );
  objects.push(
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(latin1Bytes(pdf).length);
    pdf += obj;
  }
  const xrefStart = latin1Bytes(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return new Blob([latin1Bytes(pdf) as BlobPart], { type: 'application/pdf' });
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Normaliza a WinAnsi (ISO-8859-1) para Helvetica. */
function toWinAnsi(input: string): string {
  return Array.from(input)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 0x20ac) return String.fromCharCode(0x80); // euro approx
      if (code <= 255) return ch;
      // fallback sin diacríticos
      return ch.normalize('NFD').replace(/\p{M}/gu, '');
    })
    .join('');
}

function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}
