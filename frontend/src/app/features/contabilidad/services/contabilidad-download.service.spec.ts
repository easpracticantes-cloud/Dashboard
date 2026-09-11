import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { AppConfigService } from '../../../core/services/app-config.service';
import { ContabilidadDownloadService } from './contabilidad-download.service';

describe('ContabilidadDownloadService Cruce Excel', () => {
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

  it('resuelve Generar Excel al BFF /api/v1/contabilidad/cruce-excel/export.xlsx', () => {
    expect(service.resolveUrl('/contabilidad/cruce-excel/export.xlsx')).toBe(
      '/api/v1/contabilidad/cruce-excel/export.xlsx',
    );
    expect(service.resolveUrl('/contabilidad/cruce-excel/export.xlsx?batch_id=9')).toBe(
      '/api/v1/contabilidad/cruce-excel/export.xlsx?batch_id=9',
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
      headers: { get: (n: string) => (n === 'Content-Disposition' ? 'attachment; filename="Cruce_Cuentas_2026-09-10.xlsx"' : null) },
      blob: async () => new Blob([new Uint8Array([0x50, 0x4b])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    });

    await service.download('/contabilidad/cruce-excel/export.xlsx', 'hint.xlsx');
    expect(fetch).toHaveBeenCalledWith('/api/v1/contabilidad/cruce-excel/export.xlsx', {
      headers: { Authorization: 'Bearer jwt-test' },
    });
    expect(click).toHaveBeenCalled();
  });

  it('404 en export se informa como error de generación, no como HTML', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => '<html>404</html>',
    });
    await expect(service.download('/contabilidad/cruce-excel/export.xlsx')).rejects.toThrow(
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
    await expect(service.download('/contabilidad/cruce-excel/export.xlsx')).rejects.toThrow(
      'Sesión expirada. Vuelve a iniciar sesión.',
    );
  });

  it('403 informa permisos insuficientes', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403, headers: { get: () => null } });
    await expect(service.download('/contabilidad/cruce-excel/export.xlsx')).rejects.toThrow(
      'No tienes permiso para este Excel.',
    );
  });

  it('500 informa error de generación', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });
    await expect(service.download('/contabilidad/cruce-excel/export.xlsx')).rejects.toThrow(
      'No se pudo generar el Excel.',
    );
  });
});
