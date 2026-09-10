import { DestroyRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutobitsApiService, AutobitsRecord, ImportResult } from '../../services/autobits-api.service';
import { CrossingsApiService } from '../../services/crossings-api.service';
import { CruceExcelApiService } from '../../services/cruce-excel-api.service';
import { DocumentsApiService } from '../../services/documents-api.service';
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

  beforeEach(async () => {
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
          provide: CruceExcelApiService,
          useValue: {
            upload: vi.fn(),
            getPendientes: vi.fn(() => of({ has_autobits: false, batch: null, pendientes: { total: 0, por_tipo: {}, resumen: [] }, comparacion: [] })),
          },
        },
        {
          provide: DocumentsApiService,
          useValue: {
            list: vi.fn(() => of({ items: [], total: 0 })),
            uploadBatch: vi.fn(),
            ask: vi.fn(),
          },
        },
        {
          provide: CrossingsApiService,
          useValue: {
            list: vi.fn(() => of({ items: [], total: 0 })),
            runMatching: vi.fn(() => of({})),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
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
    expect(cmp.records().map((r) => r.id)).toEqual([1, 2]);
    expect(cmp.recordsVista().length).toBe(2);
    expect(cmp.autobits()?.imported_rows).toBe(2);
    expect(cmp.aviso()).toContain('2 filas');
    expect(cmp.paso()).toBe(2);
    const table = fixture.nativeElement as HTMLElement;
    expect(table.querySelector('.wiz__table')).toBeTruthy();
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('muestra estado de lectura mientras el HTTP no responde y lo limpia al terminar', () => {
    const pending = new Subject<ImportResult>();
    autobitsApi.uploadDirect.mockReturnValue(pending.asObservable());
    const cmp = create();

    cmp.onAutobits(xlsxEvent());
    expect(cmp.subiendoAutobits()).toBe(true);
    expect(cmp.aviso()).toContain('Leyendo');
    expect(cmp.records().length).toBe(0);

    pending.next(importResult([record({ id: 9 })]));
    pending.complete();

    expect(cmp.subiendoAutobits()).toBe(false);
    expect(cmp.records()[0].id).toBe(9);
  });

  it('reutiliza el mismo archivo (mismo nombre) y vuelve a mostrar filas', () => {
    const first = importResult([record({ id: 1 })]);
    const reused = importResult([record({ id: 1 })], { reused: true, aviso: 'Este Excel ya estaba importado.' });
    autobitsApi.uploadDirect
      .mockReturnValueOnce(of(first))
      .mockReturnValueOnce(of(reused));
    const cmp = create();

    const ev1 = xlsxEvent('semana.xlsx');
    cmp.onAutobits(ev1);
    expect((ev1.target as HTMLInputElement).value).toBe('');
    expect(cmp.records().length).toBe(1);

    cmp.onAutobits(xlsxEvent('semana.xlsx'));
    expect(cmp.subiendoAutobits()).toBe(false);
    expect(cmp.records().length).toBe(1);
    expect(cmp.autobits()?.reused).toBe(true);
    expect(cmp.aviso()).toContain('ya estaba importado');
  });

  it('Vaciar abre el modal y Cancelar conserva las filas', () => {
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 4 })])));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());
    fixture.detectChanges();

    const heroVaciar = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => (b.textContent || '').includes('Vaciar cargas'));
    heroVaciar?.click();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(cmp.confirmandoVaciar()).toBe(true);
    expect(root.querySelector('.wiz__modal')).toBeTruthy();
    expect(root.querySelector('#wiz-vaciar-title')?.textContent).toContain('¿Vaciar registros?');
    expect(autobitsApi.purgeExcels).not.toHaveBeenCalled();

    const cancelar = Array.from(root.querySelectorAll('.wiz__modal button')).find((b) =>
      (b.textContent || '').includes('Cancelar')
    ) as HTMLButtonElement | undefined;
    cancelar?.click();
    fixture.detectChanges();

    expect(cmp.confirmandoVaciar()).toBe(false);
    expect(root.querySelector('.wiz__modal')).toBeNull();
    expect(autobitsApi.purgeExcels).not.toHaveBeenCalled();
    expect(cmp.records()[0].id).toBe(4);
    expect(cmp.autobits()).not.toBeNull();
  });

  it('Vaciar confirmado limpia filas y deja listo para otro Excel', () => {
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 4 })])));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());

    cmp.vaciarImportados();
    fixture.detectChanges();
    expect(autobitsApi.purgeExcels).not.toHaveBeenCalled();

    const vaciar = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.wiz__modal button')
    ).find((b) => (b.textContent || '').trim() === 'Vaciar') as HTMLButtonElement | undefined;
    vaciar?.click();
    fixture.detectChanges();

    expect(cmp.confirmandoVaciar()).toBe(false);
    expect(autobitsApi.purgeExcels).toHaveBeenCalledWith(true);
    expect(cmp.records()).toEqual([]);
    expect(cmp.autobits()).toBeNull();
    expect(cmp.paso()).toBe(1);
    expect(cmp.limpiando()).toBe(false);
    expect(cmp.aviso()).toContain('vaciadas');
  });

  it('Vaciar: Escape y overlay cierran el modal sin borrar', () => {
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 4 })])));
    const fixture = createFixture();
    const cmp = fixture.componentInstance;
    cmp.onAutobits(xlsxEvent());

    cmp.vaciarImportados();
    fixture.detectChanges();
    cmp.onEscapeVaciar();
    fixture.detectChanges();
    expect(cmp.confirmandoVaciar()).toBe(false);
    expect(cmp.records()[0].id).toBe(4);

    cmp.vaciarImportados();
    fixture.detectChanges();
    ((fixture.nativeElement as HTMLElement).querySelector('.wiz__modal-backdrop') as HTMLElement | null)?.click();
    fixture.detectChanges();
    expect(cmp.confirmandoVaciar()).toBe(false);
    expect(autobitsApi.purgeExcels).not.toHaveBeenCalled();
  });

  it('archivo inválido / error HTTP termina el loading y muestra error', () => {
    autobitsApi.uploadDirect.mockReturnValue(
      throwError(() => ({ error: { detail: 'Formato no soportado. Use un archivo Excel (.xlsx).' } }))
    );
    const cmp = create();
    cmp.onAutobits(xlsxEvent('notas.txt'));

    expect(cmp.subiendoAutobits()).toBe(false);
    expect(cmp.records().length).toBe(0);
    expect(cmp.error()).toContain('xlsx');
  });

  it('error de parseo/procesamiento no deja la UI en Leyendo', () => {
    autobitsApi.uploadDirect.mockReturnValue(
      throwError(() => ({ error: { detail: 'La IA no reconoció columnas útiles.' } }))
    );
    const cmp = create();
    cmp.onAutobits(xlsxEvent());

    expect(cmp.subiendoAutobits()).toBe(false);
    expect(cmp.error()).toContain('columnas');
    expect(cmp.aviso()).toBe('');
  });

  it('ignora una restauración tardía para no tapar el Excel recién subido', () => {
    const lateRestore = new Subject<{
      id: number;
      filename: string;
      imported_rows: number;
      imported_at: string;
      imported_by: string;
      status: string;
      total_rows: number;
      skipped_rows: number;
      error_count: number;
      column_mapping: Record<string, string | null>;
    }>();
    autobitsApi.getLatestBatch.mockReturnValue(lateRestore.asObservable());
    autobitsApi.uploadDirect.mockReturnValue(of(importResult([record({ id: 77 })])));
    const cmp = create();

    cmp.onAutobits(xlsxEvent());
    expect(cmp.records()[0].id).toBe(77);

    lateRestore.next({
      id: 1,
      filename: 'viejo.xlsx',
      imported_rows: 0,
      imported_at: '',
      imported_by: '',
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

  it('DestroyRef está disponible para el flujo (zoneless + unsubscribe)', () => {
    const cmp = create();
    expect(TestBed.inject(DestroyRef)).toBeTruthy();
    cmp.ngOnDestroy();
  });
});
