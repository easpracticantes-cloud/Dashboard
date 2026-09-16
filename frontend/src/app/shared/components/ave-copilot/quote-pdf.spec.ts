import { describe, expect, it } from 'vitest';
import { buildJpegPdf } from './quote-pdf';

describe('buildJpegPdf', () => {
  it('empieza con %PDF- para que Chrome pueda abrirlo', async () => {
    // JPEG mínimo (SOI + EOI)
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const blob = buildJpegPdf(jpeg, 10, 10);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const head = String.fromCharCode(...bytes.slice(0, 8));
    expect(head.startsWith('%PDF-')).toBe(true);
    const text = String.fromCharCode(...bytes);
    expect(text).toContain('%%EOF');
    expect(text).toContain('/Root 1 0 R');
  });
});
