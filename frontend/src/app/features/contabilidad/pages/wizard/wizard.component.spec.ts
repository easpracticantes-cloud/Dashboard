/** @vitest-environment jsdom */
import { DestroyRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutobitsApiService, AutobitsRecord, ImportResult } from '../../services/autobits-api.service';
import { CrossingsApiService } from '../../services/crossings-api.service';
import { DocumentSummary, DocumentsApiService } from '../../services/documents-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { FacturasApiService } from '../../services/facturas-api.service';
import { FoldersApiService, InvoiceFolder } from '../../services/folders-api.service';
import { UiFeedbackService } from '../../../../core/services/ui-feedback.service';
import { WizardComponent } from './wizard.component';

function clearSession(): void {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

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

function folder(partial: Partial<InvoiceFolder> = {}): InvoiceFolder {
  return {
    id: 7,
    name: 'Semana test',
    status: 'OPEN',
    document_ids: [],
    document_count: 0,
    ...partial,
  };
}

describe('WizardComponent carpetas + Autobits', () => {
  let autobitsApi: {
    uploadDirect: ReturnType<typeof vi.fn>;
    getLatestBatch: ReturnType<typeof vi.fn>;
    listRecords: ReturnType<typeof vi.fn>;
    purgeExcels: ReturnType<typeof vi.fn>;
  };
  let docsApi: {
    list: ReturnType<typeof vi.fn>;
    uploadBatch: ReturnType<typeof vi.fn>;
    processBatch: ReturnType<typeof vi.fn>;
    ask: ReturnType<typeof vi.fn>;
    exportExcelUrl: ReturnType<typeof vi.fn>;
  };
  let foldersApi: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    linkAutobits: ReturnType<typeof vi.fn>;
    addDocuments: ReturnType<typeof vi.fn>;
    ask: ReturnType<typeof vi.fn>;
    recontramarcado: ReturnType<typeof vi.fn>;
  };
  let download: { download: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    clearSession();
    autobitsApi = {
      uploadDirect: vi.fn(),
      getLatestBatch: vi.fn(() => throwError(() => ({ status: 404 }))),
      listRecords: vi.fn(() => of({ items: [], total: 0 })),
      purgeExcels: vi.fn(() => of({ ok: true, deleted: { batches: 1 } })),
    };
    foldersApi = {
      list: vi.fn(() => of({ total: 0, items: [] })),
      get: vi.fn((id: number) => of(folder({ id }))),
      create: vi.fn((name: string) => of(folder({ name }))),
      patch: vi.fn((_id: number, body: { autobits_batch_id?: number }) =>
        of(folder({ autobits_batch_id: body.autobits_batch_id, status: 'READY' }))
      ),
      linkAutobits: vi.fn((id: number, batchId: number) =>
        of(folder({ id, autobits_batch_id: batchId, status: 'READY' }))
      ),
      addDocuments: vi.fn((id: number, documentIds: number[]) =>
        of({ ok: true, added: documentIds.length, folder: folder({ id, document_ids: documentIds }) })
      ),
      ask: vi.fn(() => of({ ok: true, respuesta: 'ok', documentos: 1, autobits: 1, folder_id: 7 })),
      recontramarcado: vi.fn((id: number) =>
        of({
          ok: true,
          updated: 0,
          skipped: 0,
          total: 0,
          message: 'ok',
          folder: folder({ id, autobits_batch_id: 11 }),
        })
      ),
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
            processBatch: vi.fn((ids: number[]) =>
              of({
                ok: true,
                queued: ids.length,
                pack_size: 25,
                packs: 1,
                document_ids: ids,
                mensaje: `${ids.length} documento(s) en 1 paquete(s).`,
              })
            ),
            ask: vi.fn(),
            exportExcelUrl: vi.fn((ids?: number[]) =>
              `/contabilidad/documents/export-excel${ids?.length ? `?document_ids=${ids.join(',')}` : ''}`
            ),
          }),
        },
        { provide: FoldersApiService, useValue: foldersApi },
        {
          provide: FacturasApiService,
          useValue: { health: vi.fn(() => of({ ai: true, ai_key_configured: true })) },
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
    clearSession();
    TestBed.resetTestingModule();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(WizardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function withFolder(cmp: WizardComponent): void {
    cmp.carpetaActiva.set(folder());
  }

  it('selección de Excel: termina loading y deja filas', () => {
    const rows = [record({ id: 1 }), record({ id: 2, proveedor: 'Acme' })];
    autobitsApi.uploadDirect.mockReturnValue(of(importResult(rows)));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    withFolder(cmp);
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();
    expect(cmp.subiendoAutobits()).toBe(false);
    expect(cmp.records().length).toBe(2);
    expect(cmp.paso()).toBe(2);
  });

  it('solo 2 pasos y botón Generar Excel de cruce', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    const html = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(html).toContain('Generar Excel de cruce');
    expect(html).toContain('Carpetas de facturas');
    expect(html).not.toContain('Chat con la IA sobre este paquete');
    expect(html).not.toContain('Qué quieres que saque o revise');
    expect(cmp.steps.length).toBe(2);
  });

  it('facturas se habilitan con carpeta (sin Autobits)', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    withFolder(cmp);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[accept*=".pdf"]'
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(false);
  });

  it('Generar Excel se habilita con facturas de carpeta', () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.carpetaActiva.set(folder({ document_ids: [44], document_count: 1 }));
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
    expect(cmp.puedeGenerarExcel()).toBe(true);
  });

  it('generarExcel envía document_ids de la carpeta', async () => {
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.carpetaActiva.set(folder({ document_ids: [44], document_count: 1 }));
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
      expect.stringMatching(/^Cruce_Cuentas_\d{4}-\d{2}-\d{2}\.xlsx$/)
    );
  });

  it('DestroyRef está disponible', () => {
    const fixture = createFixture();
    expect(TestBed.inject(DestroyRef)).toBeTruthy();
    fixture.componentInstance.ngOnDestroy();
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
    withFolder(cmp);
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

  describe('volver a analizar facturas', () => {
    function doc(partial: Partial<DocumentSummary> & { id: number }): DocumentSummary {
      return {
        filename: `factura-${partial.id}.pdf`,
        tipo: 'FACTURA',
        origen: 'CARGA_MANUAL',
        estado: 'EXTRAIDO',
        numero_documento: 'FE-100',
        total: 1000,
        requiere_revision: false,
        received_at: '2026-09-10T00:00:00',
        ...partial,
      };
    }

    function conFacturas(cmp: WizardComponent, docs: DocumentSummary[]): void {
      cmp.carpetaActiva.set(folder({ document_ids: docs.map((d) => d.id) }));
      cmp.documentos.set(docs);
    }

    it('Caso A: una factura con error se reenvía al procesamiento y queda PROCESANDO', () => {
      const pendiente = new Subject<never>();
      docsApi.processBatch.mockReturnValue(pendiente.asObservable());
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      conFacturas(cmp, [doc({ id: 1, estado: 'ERROR' }), doc({ id: 2 })]);

      cmp.volverAAnalizarFacturas();

      expect(docsApi.processBatch).toHaveBeenCalledWith([1]);
      expect(cmp.documentos().find((d) => d.id === 1)?.estado).toBe('PROCESANDO');
      expect(cmp.documentos().find((d) => d.id === 2)?.estado).toBe('EXTRAIDO');
    });

    it('Caso B: varias pendientes entran todas, nunca una lista vacía', () => {
      docsApi.processBatch.mockReturnValue(new Subject<never>().asObservable());
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      conFacturas(cmp, [
        doc({ id: 1, estado: 'ERROR' }),
        doc({ id: 2, estado: 'RECIBIDO' }),
        doc({ id: 3, numero_documento: undefined }),
        doc({ id: 4 }),
      ]);

      cmp.volverAAnalizarFacturas();

      expect(docsApi.processBatch).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('Caso C: sin pendientes ni Excel avisa y no llama al backend', () => {
      const feedback = TestBed.inject(UiFeedbackService);
      const avisar = vi.spyOn(feedback, 'error');
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      conFacturas(cmp, [doc({ id: 1 }), doc({ id: 2 })]);

      cmp.volverAAnalizarFacturas();

      expect(docsApi.processBatch).not.toHaveBeenCalled();
      expect(foldersApi.recontramarcado).not.toHaveBeenCalled();
      expect(avisar.mock.calls[0][0]).toContain('No hay facturas pendientes');
    });

    it('Caso D: si el backend falla, la factura no queda marcada como procesada', () => {
      docsApi.processBatch.mockReturnValue(
        throwError(() => ({ status: 503, error: { detail: 'OCR no disponible' } }))
      );
      const feedback = TestBed.inject(UiFeedbackService);
      const avisar = vi.spyOn(feedback, 'error');
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      conFacturas(cmp, [doc({ id: 1, estado: 'ERROR' })]);

      cmp.volverAAnalizarFacturas();

      expect(avisar.mock.calls[0][0]).toContain('OCR no disponible');
      expect(cmp.reanalizando()).toBe(false);
      expect(cmp.analizandoFacturas()).toBe(false);
    });

    it('Caso E: doble clic dispara un solo procesamiento', () => {
      docsApi.processBatch.mockReturnValue(new Subject<never>().asObservable());
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      conFacturas(cmp, [doc({ id: 1, estado: 'ERROR' })]);

      cmp.volverAAnalizarFacturas();
      cmp.volverAAnalizarFacturas();

      expect(docsApi.processBatch).toHaveBeenCalledTimes(1);
    });

    it('con todas las facturas leídas y Excel cargado, reasigna el COM', () => {
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      cmp.carpetaActiva.set(folder({ document_ids: [1], autobits_batch_id: 11 }));
      cmp.documentos.set([doc({ id: 1 })]);

      cmp.volverAAnalizarFacturas();

      expect(docsApi.processBatch).not.toHaveBeenCalled();
      expect(foldersApi.recontramarcado).toHaveBeenCalledWith(7, {
        onlyMissingCom: false,
        reset: true,
        autobitsBatchId: 11,
      });
    });

    it('no reprocesa facturas pagadas ni duplicadas', () => {
      const fixture = createFixture();
      const cmp = fixture.componentInstance;
      conFacturas(cmp, [
        doc({ id: 1, estado: 'PAGADO', numero_documento: undefined }),
        doc({ id: 2, estado: 'DUPLICADO', total: undefined }),
      ]);

      cmp.volverAAnalizarFacturas();

      expect(docsApi.processBatch).not.toHaveBeenCalled();
    });
  });
});
