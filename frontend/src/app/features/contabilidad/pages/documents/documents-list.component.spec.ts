import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsApiService, DocumentSummary } from '../../services/documents-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { DocumentsListComponent } from './documents-list.component';

function doc(partial: Partial<DocumentSummary> & { id: number }): DocumentSummary {
  return {
    filename: `fac-${partial.id}.pdf`,
    tipo: 'FACTURA',
    origen: 'CARGA_MANUAL',
    estado: 'PROCESADO',
    requiere_revision: false,
    received_at: '2026-09-11T00:00:00',
    ...partial,
  };
}

describe('DocumentsListComponent paquete + Excel', () => {
  let api: {
    list: ReturnType<typeof vi.fn>;
    uploadBatch: ReturnType<typeof vi.fn>;
    processBatch: ReturnType<typeof vi.fn>;
    ask: ReturnType<typeof vi.fn>;
    exportExcelUrl: ReturnType<typeof vi.fn>;
  };
  let download: { download: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DocumentsListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: DocumentsApiService,
          useValue: (api = {
            list: vi.fn(() => of({ items: [], total: 0 })),
            uploadBatch: vi.fn(),
            processBatch: vi.fn(),
            ask: vi.fn(),
            exportExcelUrl: vi.fn((ids?: number[]) =>
              `/contabilidad/documents/export-excel${ids?.length ? `?document_ids=${ids.join(',')}` : ''}`,
            ),
          }),
        },
        {
          provide: ContabilidadDownloadService,
          useValue: (download = { download: vi.fn(async () => undefined) }),
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  function create(): DocumentsListComponent {
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('no pide adjuntar Excel de cruce y ofrece Generar Excel', () => {
    const fixture = TestBed.createComponent(DocumentsListComponent);
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(html).toContain('Generar Excel');
    expect(html).not.toContain('Soltar o elegir CRUCE DE CUENTAS');
    const fileLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="file"]'),
    ).map((el) => el.closest('label')?.textContent || '');
    expect(fileLabels.some((t) => /CRUCE DE CUENTAS|hoja de cruce/i.test(t))).toBe(false);
  });

  it('Generar Excel se habilita solo con IDs del paquete, no con el listado global', () => {
    const cmp = create();
    cmp.documentos = [doc({ id: 99 })];
    expect(cmp.idsParaExcel).toEqual([]);
    expect(cmp.puedeGenerarExcel).toBe(false);

    cmp.loteIds = new Set([44]);
    cmp.documentos = [doc({ id: 44 }), doc({ id: 99 })];
    expect(cmp.idsParaExcel).toEqual([44]);
    expect(cmp.idsListosParaExcel).toEqual([44]);
    expect(cmp.puedeGenerarExcel).toBe(true);
  });

  it('Generar Excel espera si alguna factura del paquete sigue en PROCESANDO', () => {
    const cmp = create();
    cmp.loteIds = new Set([44]);
    cmp.documentos = [doc({ id: 44, estado: 'PROCESANDO' })];
    expect(cmp.puedeGenerarExcel).toBe(false);
    expect(cmp.idsListosParaExcel).toEqual([]);
  });

  it('generarExcel envía document_ids del paquete y no batch_id', async () => {
    const cmp = create();
    cmp.loteIds = new Set([44]);
    cmp.documentos = [doc({ id: 44 })];
    await cmp.generarExcel();
    expect(api.exportExcelUrl).toHaveBeenCalledWith([44]);
    expect(download.download).toHaveBeenCalledWith(
      '/contabilidad/documents/export-excel?document_ids=44',
      expect.stringMatching(/^Facturas_Autobits_\d{4}-\d{2}-\d{2}\.xlsx$/),
    );
    expect(cmp.excelEstado).toBe('generado');
  });

  it('restaurarIdsPaquete recupera el paquete de sessionStorage', () => {
    sessionStorage.setItem('contab-facturas-pack-ids', JSON.stringify([7, 8]));
    const cmp = create();
    expect([...cmp.loteIds]).toEqual([7, 8]);
  });
});
