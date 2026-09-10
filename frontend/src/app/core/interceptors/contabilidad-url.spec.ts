import { describe, expect, it } from 'vitest';
import { rewriteContabilidadUrl } from './contabilidad-url';

describe('rewriteContabilidadUrl', () => {
  it('manda el chat de facturas a POST /api/v1/contabilidad/documents/ask', () => {
    expect(rewriteContabilidadUrl('/contabilidad/documents/ask', '/api/v1')).toBe(
      '/api/v1/contabilidad/documents/ask'
    );
  });

  it('reescribe URLs absolutas (si HttpClient las absolutiza)', () => {
    expect(
      rewriteContabilidadUrl('http://127.0.0.1:8080/contabilidad/documents/ask', '/api/v1')
    ).toBe('/api/v1/contabilidad/documents/ask');
  });

  it('no deja el POST en la ruta SPA /contabilidad (origen del 405 de Nginx)', () => {
    const out = rewriteContabilidadUrl('/contabilidad/documents/ask', '/api/v1');
    expect(out?.startsWith('/api/v1/contabilidad/')).toBe(true);
    expect(out).not.toBe('/contabilidad/documents/ask');
  });

  it('no toca endpoints que no son de contabilidad', () => {
    expect(rewriteContabilidadUrl('/api/v1/ai/chat', '/api/v1')).toBeNull();
    expect(rewriteContabilidadUrl('/integrations/sheets/seguimiento', '/api/v1')).toBeNull();
  });
});
