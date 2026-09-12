import { DestroyRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutobitsApiService, AutobitsRecord, ImportResult } from '../../services/autobits-api.service';
import { CrossingsApiService } from '../../services/crossings-api.service';
import { DocumentsApiService } from '../../services/documents-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { WizardComponent } from './wizard.component';

function xlsxEvent(name = 'semana.xlsx'): Event {
  const file = new File([new Uint8Array([0x50, 0x4b])], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  return { target: input } as unknown as Event;
}

function record(partial: Partial<AutobitsRecord> & { id: number }): AutobitsRecord {
  return {
    import_batch_id: 1,
    row_number: partial.id,
    estado: 'IMPORTADO',
    created_at: '2026-09-10T00:00:00',
    proveedor: 'Hotel Andino',
    numero_compra: 'C-1',
    valor: 1000,
    ...partial,
  };
}

function importResult(rows: AutobitsRecord[], extra: Partial<ImportResult> = {}): ImportResult {
  return {
    batch: {
      id: 11,
      filename: 'semana.xlsx',
      period_start: '2026-09-06',
      period_end: '2026-09-12',
      total_rows: rows.length,
      imported_rows: rows.length,
      skipped_rows: 0,
      error_count: 0,
      status: 'IMPORTADO',
      imported_by: 'test',
      imported_at: '2026-09-10T00:00:00',
      column_mapping: {},
    },
    imported_rows: rows.length,
    skipped_duplicates: 0,
    skipped_empty: 0,
    parse_errors: [],
    records: rows,
    reused: false,
    ...extra,
  };
}

describe('WizardComponent Autobits Excel flow', () => {
  let autobitsApi: {
    uploadDirect: ReturnType<typeof vi.fn>;
    getLatestBatch: ReturnType<typeof vi.fn>;
    listRecords: ReturnType<typeof vi.fn>;
    purgeExcels: ReturnType<typeof vi.fn>;
  };
  let docsApi: {
    list: ReturnType<typeof vi.fn>;
    uploadBatch: ReturnType<typeof vi.fn>;
    ask: ReturnType<typeof vi.fn>;
    exportExcelUrl: ReturnType<typeof vi.fn>;
  };
  let download: { download: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    sessionStorage.clear();
    autobitsApi = {
      uploadDirect: vi.fn(),
      getLatestBatch: vi.fn(() => throwError(() => ({ status: 404 }))),
      listRecords: vi.fn(() => of({ items: [], total: 0 })),
      purgeExcels: vi.fn(() => of({ ok: true, deleted: { batches: 1 } })),
    };

    await TestBed.configureTestingModule({
      imports: [WizardComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AutobitsApiService, useValue: autobitsApi },
        {
          provide: DocumentsApiService,
          useValue: (docsApi = {
            list: vi.fn(() => of({ items: [], total: 0 })),
            uploadBatch: vi.fn(),
            ask: vi.fn(),
            exportExcelUrl: vi.fn((ids?: number[]) =>
              `/contabilidad/documents/export-excel${ids?.length ? `?document_ids=${ids.join(',')}` : ''}`,
            ),
          }),
        },
        {
          provide: CrossingsApiService,
          useValue: {
            list: vi.fn(() => of({ items: [], total: 0 })),
            runMatching: vi.fn(() => of({})),
          },
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

  function createFixture() {
    const fixture = TestBed.createComponent(WizardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function create(): WizardComponent {
    return createFixture().componentInstance;
  }

  it('selección de Excel: termina loading y deja filas sin otro clic', () => {
    const rows = [record({ id: 1 }), record({ id: 2, proveedor: 'Acme' })];
    autobitsApi.uploadDirect.mockReturnValue(of(importResult(rows)));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();
    expect(cmp.subiendoAutobits()).toBe(false);
    expect(cmp.records().length).toBe(2);
    expect(cmp.paso()).toBe(2);
  });

  it('no pide adjuntar Excel de Cruce; solo 2 pasos y botón Generar Excel de cruce', () => {
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 1 })])));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();

    const html = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(html).toContain('Generar Excel de cruce');
    expect(html).not.toContain('3. Cruce de Cuentas');
    expect(html).not.toContain('Procesar');
    expect(html).not.toContain('Soltar o elegir CRUCE DE CUENTAS');
    expect(cmp.steps.length).toBe(2);
    const fileLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="file"]')
    ).map((el) => el.closest('label')?.textContent || '');
    expect(fileLabels.some((t) => /CRUCE DE CUENTAS|hoja de cruce/i.test(t))).toBe(false);
  });

  it('facturas se habilitan con Autobits', () => {
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 1 })])));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[accept*=".pdf"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(false);
    const card = input.closest('.wiz__card');
    expect(card?.classList.contains('is-dim')).toBe(false);
  });

  it('Generar Excel se habilita solo cuando hay facturas del paquete, no con Autobits solo', () => {
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 1 })])));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();

    const btn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => (b.textContent || '').includes('Generar Excel de cruce')) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);

    cmp.documentos.set([
      {
        id: 44,
        filename: 'fac-a.pdf',
        tipo: 'FACTURA',
        origen: 'CARGA_MANUAL',
        estado: 'PROCESADO',
        requiere_revision: false,
        received_at: '2026-09-11T00:00:00',
      },
    ]);
    cmp.idsFacturasOperacion.set([44]);
    fixture.detectChanges();
    expect(cmp.puedeGenerarExcel()).toBe(true);
  });

  it('Generar Excel no usa el listado global de facturas', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.documentos.set([
      {
        id: 99,
        filename: 'otra.pdf',
        tipo: 'FACTURA',
        origen: 'CARGA_MANUAL',
        estado: 'PROCESADO',
        requiere_revision: false,
        received_at: '2026-09-11T00:00:00',
      },
    ]);
    fixture.detectChanges();
    expect(cmp.idsParaExcel()).toEqual([]);
    expect(cmp.puedeGenerarExcel()).toBe(false);
  });

  it('generarExcel envía document_ids del paquete', async () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.idsFacturasOperacion.set([44]);
    cmp.documentos.set([
      {
        id: 44,
        filename: 'fac-a.pdf',
        tipo: 'FACTURA',
        origen: 'CARGA_MANUAL',
        estado: 'PROCESADO',
        requiere_revision: false,
        received_at: '2026-09-11T00:00:00',
      },
    ]);
    fixture.detectChanges();
    await cmp.generarExcel();
    expect(docsApi.exportExcelUrl).toHaveBeenCalledWith([44]);
    expect(download.download).toHaveBeenCalledWith(
      '/contabilidad/documents/export-excel?document_ids=44',
      expect.stringMatching(/^Facturas_Autobits_\d{4}-\d{2}-\d{2}\.xlsx$/),
    );
  });

  it('DestroyRef está disponible para el flujo (zoneless + unsubscribe)', () => {
    const cmp = create();
    expect(TestBed.inject(DestroyRef)).toBeTruthy();
    cmp.ngOnDestroy();
  });

  it('una restauración tardía no pisa una carga nueva del usuario', () => {
    const lateRestore = new Subject<{
      id: number;
      filename: string;
      period_start: string;
      period_end: string;
      imported_rows: number;
      imported_at: string;
      imported_by: string;
      status: string;
      total_rows: number;
      skipped_rows: number;
      error_count: number;
      column_mapping: Record<string, string>;
    }>();
    autobitsApi.getLatestBatch.mockReturnValue(lateRestore.asObservable());
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 77 })])));

    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();

    lateRestore.next({
      id: 1,
      filename: 'viejo.xlsx',
      period_start: '2026-01-01',
      period_end: '2026-01-07',
      imported_rows: 1,
      imported_at: '2026-01-01T00:00:00',
      imported_by: 'test',
      status: '',
      total_rows: 0,
      skipped_rows: 0,
      error_count: 0,
      column_mapping: {},
    });
    lateRestore.complete();

    expect(cmp.records()[0].id).toBe(77);
    expect(cmp.autobits()?.batch.filename).toBe('semana.xlsx');
  });
});
