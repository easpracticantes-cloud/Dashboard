import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { AppConfigService } from '../../../core/services/app-config.service';
import { ContabilidadDownloadService } from './contabilidad-download.service';

describe('ContabilidadDownloadService Facturas Excel', () => {
  let service: ContabilidadDownloadService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ContabilidadDownloadService,
        { provide: AuthService, useValue: { token: () => 'jwt-test' } },
        { provide: AppConfigService, useValue: { apiBaseUrl: '/api/v1' } },
      ],
    });
    service = TestBed.inject(ContabilidadDownloadService);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('resuelve Generar Excel al BFF /api/v1/contabilidad/documents/export-excel', () => {
    expect(service.resolveUrl('/contabilidad/documents/export-excel')).toBe(
      '/api/v1/contabilidad/documents/export-excel',
    );
    expect(service.resolveUrl('/contabilidad/documents/export-excel?document_ids=9')).toBe(
      '/api/v1/contabilidad/documents/export-excel?document_ids=9',
    );
  });

  it('descarga el blob XLSX con Authorization y nombre de archivo', async () => {
    const click = vi.fn();
    vi.stubGlobal(
      'URL',
      {
        createObjectURL: vi.fn(() => 'blob:xlsx'),
        revokeObjectURL: vi.fn(),
      } as unknown as typeof URL,
    );
    vi.spyOn(document, 'createElement').mockImplementation(
      () => ({ click, href: '', download: '' }) as unknown as HTMLAnchorElement,
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === 'Content-Disposition' ? 'attachment; filename="Facturas_Autobits_2026-09-10.xlsx"' : null) },
      arrayBuffer: async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer,
    });

    await service.download('/contabilidad/documents/export-excel', 'hint.xlsx');
    expect(fetch).toHaveBeenCalledWith('/api/v1/contabilidad/documents/export-excel', {
      headers: { Authorization: 'Bearer jwt-test' },
    });
    expect(click).toHaveBeenCalled();
  });

  it('rechaza una respuesta que no es ZIP/XLSX', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new TextEncoder().encode('<html>error</html>').buffer,
    });
    await expect(service.download('/contabilidad/documents/export-excel')).rejects.toThrow(
      'La respuesta no es un Excel válido',
    );
  });

  it('404 en export se informa como error de generación, no como HTML', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => '<html>404</html>',
    });
    await expect(service.download('/contabilidad/documents/export-excel')).rejects.toThrow(
      'No se pudo generar el Excel.',
    );
  });

  it('404 en descarga por id informa archivo inexistente', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
    });
    await expect(service.download('/contabilidad/packages/12/download')).rejects.toThrow(
      'El archivo generado ya no está disponible.',
    );
  });

  it('401 informa sesión expirada', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } });
    await expect(service.download('/contabilidad/documents/export-excel')).rejects.toThrow(
      'Sesión expirada. Vuelve a iniciar sesión.',
    );
  });

  it('403 informa permisos insuficientes', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403, headers: { get: () => null } });
    await expect(service.download('/contabilidad/documents/export-excel')).rejects.toThrow(
      'No tienes permiso para este Excel.',
    );
  });

  it('500 informa error de generación', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });
    await expect(service.download('/contabilidad/documents/export-excel')).rejects.toThrow(
      'No se pudo generar el Excel.',
    );
  });
});
