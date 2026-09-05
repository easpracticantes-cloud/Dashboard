import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { interval, Subscription } from 'rxjs';
import { AutobitsApiService, AutobitsRecord, ImportResult } from '../../services/autobits-api.service';
import { CrossingsApiService, CrossingSummary } from '../../services/crossings-api.service';
import {
  ComparacionFila,
  CruceExcelApiService,
  CruceUploadResult,
  PendienteItem,
} from '../../services/cruce-excel-api.service';
import {
  BatchUploadItem,
  DocumentSummary,
  DocumentsApiService,
} from '../../services/documents-api.service';
import { formatCop } from '../../utils/contabilidad-labels';

const SESSION_KEY = 'contab-wizard-session';

@Component({
  selector: 'eas-contabilidad-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './wizard.component.html',
  styleUrl: './wizard.component.scss',
})
export class WizardComponent implements OnInit, OnDestroy {
  private readonly autobitsApi = inject(AutobitsApiService);
  private readonly cruceApi = inject(CruceExcelApiService);
  private readonly docsApi = inject(DocumentsApiService);
  private readonly crossingsApi = inject(CrossingsApiService);

  readonly formatCop = formatCop;
  readonly steps = [
    { n: 1, title: 'Excel Autobits', hint: 'De ahí salen compra, fecha, cliente y valor.' },
    { n: 2, title: 'Excel de cruces', hint: 'CRUCE DE CUENTAS: FACTURA/CDC y fecha de pago.' },
    { n: 3, title: 'Facturas', hint: 'Hasta 25 a la vez. Se cruzan con Autobits.' },
  ];

  paso = 1;
  limpiando = false;
  error = '';
  aviso = '';

  subiendoAutobits = false;
  autobits?: ImportResult | null;
  records: AutobitsRecord[] = [];

  subiendoCruce = false;
  cruce?: CruceUploadResult | null;
  comparacion: ComparacionFila[] = [];

  subiendoFacturas = false;
  facturaItems: BatchUploadItem[] = [];
  documentos: DocumentSummary[] = [];
  crossings: CrossingSummary[] = [];
  packMsg = '';
  soloPendientes = true;
  copiado = '';
  private poll?: Subscription;

  ngOnInit(): void {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      this.vaciarImportados(true);
    } else {
      this.restaurar();
    }
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
  }

  get pendientesLista(): PendienteItem[] {
    const por = this.cruce?.pendientes?.por_tipo || {};
    return Object.values(por).flat();
  }

  get comparacionVista(): ComparacionFila[] {
    if (!this.soloPendientes) return this.comparacion;
    return this.comparacion.filter((r) => r.faltas?.length);
  }

  get kpis() {
    const total = this.comparacion.length;
    const incompletas = this.comparacion.filter((r) => r.faltas?.length).length;
    return {
      autobits: this.autobits?.imported_rows || this.records.length,
      cruce: this.cruce?.lectura?.filas_leidas || 0,
      incompletas,
      completas: Math.max(0, total - incompletas),
      facturas: this.documentos.length,
      cruces: this.crossings.length,
    };
  }

  vaciarImportados(silencio = false): void {
    this.limpiando = true;
    this.error = '';
    this.autobitsApi.purgeExcels(true).subscribe({
      next: () => {
        this.limpiando = false;
        sessionStorage.setItem(SESSION_KEY, '1');
        this.autobits = null;
        this.records = [];
        this.cruce = null;
        this.comparacion = [];
        this.facturaItems = [];
        this.documentos = [];
        this.crossings = [];
        this.paso = 1;
        if (!silencio) this.aviso = 'Cargas anteriores vaciadas. Empieza por Autobits.';
      },
      error: (err) => {
        this.limpiando = false;
        sessionStorage.setItem(SESSION_KEY, '1');
        if (!silencio) this.error = err?.error?.detail || 'No se pudieron vaciar las cargas.';
      },
    });
  }

  onAutobits(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    this.subiendoAutobits = true;
    this.error = '';
    this.autobitsApi.uploadDirect(file, true).subscribe({
      next: (res) => {
        this.subiendoAutobits = false;
        this.autobits = res;
        this.aviso = `${res.imported_rows} filas de Autobits. Fecha, cliente y compra ya están listas.`;
        this.cargarRecords();
        this.paso = 2;
      },
      error: (err) => {
        this.subiendoAutobits = false;
        this.error = this.detalleError(err, 'No se pudo leer el Excel de Autobits.');
      },
    });
  }

  onCruce(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    if (!this.autobits) {
      this.error = 'Primero sube el Excel de Autobits.';
      return;
    }
    this.subiendoCruce = true;
    this.error = '';
    this.cruceApi.upload(file, true).subscribe({
      next: (res) => {
        this.subiendoCruce = false;
        this.cruce = res;
        this.comparacion = res.comparacion || [];
        this.aviso = `Cruce leído: ${res.lectura.filas_leidas} filas en ${res.lectura.hojas.length} hojas.`;
        this.paso = 3;
      },
      error: (err) => {
        this.subiendoCruce = false;
        this.error = this.detalleError(err, 'No se pudo leer el Excel de cruces.');
      },
    });
  }

  onFacturas(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    (ev.target as HTMLInputElement).value = '';
    if (!files.length) return;
    if (!this.autobits) {
      this.error = 'Primero sube Autobits y el cruce.';
      return;
    }
    this.subiendoFacturas = true;
    this.error = '';
    this.docsApi.uploadBatch(files, 'FACTURA', 25).subscribe({
      next: (res) => {
        this.subiendoFacturas = false;
        this.facturaItems = res.items;
        this.packMsg = res.mensaje;
        if (res.total_duplicados) {
          this.aviso = `${res.total_duplicados} archivo(s) ya estaban importados y se rechazaron.`;
        }
        this.refrescarFacturas();
        this.startPoll();
      },
      error: (err) => {
        this.subiendoFacturas = false;
        this.error = this.detalleError(err, 'No se pudieron subir las facturas.');
      },
    });
  }

  copiar(texto: string): void {
    if (!texto) return;
    navigator.clipboard?.writeText(texto);
    this.copiado = texto;
    this.aviso = 'Copiado. Pégalo en el Excel: FECHA · COMPRA · REF · VALOR · FACTURA/CDC · FECHA DE PAGO.';
  }

  copiarPendientes(): void {
    const lineas = this.comparacionVista.map((r) => r.copiar).filter(Boolean);
    if (!lineas.length) return;
    this.copiar(lineas.join('\n'));
  }

  texto(v: unknown): string {
    if (v == null || v === '') return '—';
    return String(v);
  }

  dinero(v: unknown): string {
    if (typeof v === 'number' || typeof v === 'string') return formatCop(v);
    return '—';
  }

  private cargarRecords(): void {
    const batchId = this.autobits?.batch?.id;
    this.autobitsApi.listRecords({ batch_id: batchId, limit: 80 }).subscribe({
      next: (res) => (this.records = res.items || []),
      error: () => (this.records = []),
    });
  }

  private refrescarFacturas(): void {
    this.docsApi.list({ limit: 80 }).subscribe({
      next: (res) => (this.documentos = res.items || []),
      error: () => undefined,
    });
    this.crossingsApi.list({ limit: 200, batch_id: this.autobits?.batch?.id }).subscribe({
      next: (res) => (this.crossings = res.items || []),
      error: () => undefined,
    });
  }

  private startPoll(): void {
    this.poll?.unsubscribe();
    this.poll = interval(4000).subscribe(() => {
      this.refrescarFacturas();
      const pending = this.documentos.some((d) =>
        ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
      );
      if (!pending && this.documentos.length) {
        this.poll?.unsubscribe();
        this.crossingsApi.runMatching(this.autobits?.batch?.id).subscribe({
          next: () => this.refrescarFacturas(),
        });
      }
    });
  }

  private restaurar(): void {
    this.autobitsApi.getLatestBatch().subscribe({
      next: (batch) => {
        this.autobits = {
          batch,
          imported_rows: batch.imported_rows,
          skipped_duplicates: 0,
          skipped_empty: 0,
          parse_errors: [],
        };
        this.cargarRecords();
        this.paso = 2;
        this.cruceApi.getPendientes(batch.id).subscribe({
          next: (p) => {
            this.comparacion = p.comparacion || [];
            if (p.ultimo_cruce?.archivo && p.batch) {
              this.cruce = {
                aplicado: !!p.ultimo_cruce.aplicado,
                archivo: p.ultimo_cruce.archivo,
                batch: p.batch,
                lectura: {
                  filas_leidas: this.comparacion.length,
                  filas_duplicadas: 0,
                  hojas: [],
                  avisos: [],
                },
                conciliacion: {
                  emparejadas: this.comparacion.filter((r) => !r.faltas.includes('Esta fila de Autobits no está en el Excel de cruce')).length,
                  sin_correspondencia: p.ultimo_cruce.sobrantes || 0,
                  fuera_de_periodo: 0,
                  sin_fecha: 0,
                  actualizadas: 0,
                  conflictos: [],
                },
                comparacion: this.comparacion,
                pendientes: p.pendientes,
              };
              this.paso = 3;
            } else if (p.has_autobits) {
              this.paso = 2;
            }
          },
        });
        this.refrescarFacturas();
      },
      error: () => {
        this.paso = 1;
      },
    });
  }

  private detalleError(err: { error?: { detail?: string } }, fallback: string): string {
    const d = err?.error?.detail;
    return typeof d === 'string' ? d : fallback;
  }
}
