/**
 * Exporta la cotización HTML a PDF (captura del sheet renderizado).
 */
import html2canvas from 'html2canvas';
import type { QuoteSheetDocument } from './quote-sheet.model';
import type { QuoteTemplateInput } from './quote-template';

export type QuotePdfData = QuoteTemplateInput | QuoteSheetDocument;

export async function downloadQuotePdf(
  data: QuotePdfData,
  sheetEl?: HTMLElement | null
): Promise<void> {
  const el = sheetEl ?? (document.querySelector('eas-quote-sheet .qs') as HTMLElement | null);
  if (!el) {
    throw new Error('No se encontró la hoja de cotización para exportar');
  }

  const scaleHost = el.closest('.aqr__sheet-scale') as HTMLElement | null;
  const prevTransform = scaleHost?.style.transform ?? '';
  if (scaleHost) {
    // html2canvas falla o recorta con transform: scale() en un ancestro
    scaleHost.style.transform = 'none';
  }

  const wasEdit = el.classList.contains('qs--edit');
  el.classList.remove('qs--edit');

  try {
    await waitForImages(el);
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined);
    }
    await sleep(40);

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 12000,
      removeContainer: true,
      onclone: (_doc, cloned) => {
        cloned.classList.remove('qs--edit');
        // Herramientas de edición no deben salir en el PDF
        cloned.querySelectorAll('.qs-tools').forEach((node) => node.remove());
        neutralizeCaptureStyles(cloned);
      }
    });

    if (!canvas.width || !canvas.height) {
      throw new Error('La captura del PDF quedó vacía');
    }

    const jpeg = await canvasToJpeg(canvas, 0.92);
    const blob = jpegToPdf(jpeg, canvas.width, canvas.height);
    const code = (('code' in data && data.code) || ('quoteNumber' in data && data.quoteNumber) || 'EAS')
      .toString()
      .replace(/[^\w.-]+/g, '_');
    triggerDownload(blob, `cotizacion-${code}-${stamp()}.pdf`);
  } finally {
    if (scaleHost) {
      scaleHost.style.transform = prevTransform;
    }
    if (wasEdit) {
      el.classList.add('qs--edit');
    }
  }
}

function neutralizeCaptureStyles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.qs-hero__veil, .qs-hero__bloom, .qs-hero__bird, .qs-hero__bird-wrap').forEach((node) => {
    node.style.mixBlendMode = 'normal';
    node.style.filter = 'none';
    node.style.animation = 'none';
  });
  root.querySelectorAll<HTMLElement>('[style*="transform"]').forEach((node) => {
    if (node.classList.contains('aqr__sheet-scale') || node === root) {
      node.style.transform = 'none';
    }
  });
}

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (!imgs.length) {
    return Promise.resolve();
  }
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          // Si ya está en caché pero complete=false en algunos browsers
          setTimeout(done, 4000);
        })
    )
  ).then(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            // Fallback si toBlob no está disponible / canvas tainted
            try {
              const dataUrl = canvas.toDataURL('image/jpeg', quality);
              resolve(dataUrlToBytes(dataUrl));
            } catch (err) {
              reject(err instanceof Error ? err : new Error('No se pudo generar la imagen'));
            }
            return;
          }
          resolve(new Uint8Array(await blob.arrayBuffer()));
        },
        'image/jpeg',
        quality
      );
    } catch (err) {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrlToBytes(dataUrl));
      } catch {
        reject(err instanceof Error ? err : new Error('No se pudo generar la imagen'));
      }
    }
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const pageW = 595;
  const pageH = Math.max(1, Math.round((imgH / imgW) * pageW));
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

  let body = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
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
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar después: si se hace al instante algunos browsers cancelan la descarga
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
