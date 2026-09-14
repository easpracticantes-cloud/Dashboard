/**
 * Exporta la cotización HTML a PDF (captura fidelísima del sheet renderizado).
 */
import html2canvas from 'html2canvas';
import type { QuoteSheetDocument } from './quote-sheet.model';
import type { QuoteTemplateInput } from './quote-template';

export type QuotePdfData = QuoteTemplateInput | QuoteSheetDocument;

export async function downloadQuotePdf(
  data: QuotePdfData,
  sheetEl?: HTMLElement | null
): Promise<void> {
  const el = sheetEl ?? document.querySelector('eas-quote-sheet .qs') as HTMLElement | null;
  if (!el) {
    throw new Error('No se encontró la hoja de cotización para exportar');
  }

  const wasEdit = el.classList.contains('qs--edit');
  el.classList.remove('qs--edit');

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false
    });
    const jpeg = await canvasToJpeg(canvas, 0.93);
    const blob = jpegToPdf(jpeg, canvas.width, canvas.height);
    const code = (('code' in data && data.code) || ('quoteNumber' in data && data.quoteNumber) || 'EAS')
      .toString()
      .replace(/[^\w.-]+/g, '_');
    triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
  } finally {
    if (wasEdit) {
      el.classList.add('qs--edit');
    }
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('No se pudo generar la imagen'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      quality
    );
  });
}

function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const pageW = 595;
  const pageH = Math.round((imgH / imgW) * pageW);
  const objects: Uint8Array[] = [];
  objects.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  objects.push(ascii('2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj\n'));
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
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  objects.push(ascii(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`));

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
  return new Blob([concat(body, ascii(xref), ascii(trailer)) as Uint8Array<ArrayBuffer>], {
    type: 'application/pdf'
  });
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
