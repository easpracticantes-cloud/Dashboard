import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, finalize, interval } from 'rxjs';
import {
  AutobitsApiService,
  AutobitsRecord,
  ImportResult,
} from '../../services/autobits-api.service';
import { CrossingsApiService, CrossingSummary } from '../../services/crossings-api.service';
import {
  BatchUploadItem,
  DocumentSummary,
  DocumentsApiService,
} from '../../services/documents-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { formatCop } from '../../utils/contabilidad-labels';

const SESSION_KEY = 'contab-wizard-session';
const PACK_IDS_KEY = 'contab-wizard-pack-ids';
const PACK_MAX = 25;

interface ChatMsg {
  role: 'user' | 'ia';
  text: string;
}

@Component({
  selector: 'eas-contabilidad-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './wizard.component.html',
  styleUrl: './wizard.component.scss',
})
export class WizardComponent implements OnInit, OnDestroy {
  private readonly autobitsApi = inject(AutobitsApiService);
  private readonly docsApi = inject(DocumentsApiService);
  private readonly crossingsApi = inject(CrossingsApiService);
  private readonly download = inject(ContabilidadDownloadService);
  private readonly destroyRef = inject(DestroyRef);

  /** Invalida restauraciones HTTP que lleguen después de una acción del usuario. */
  private restoreSeq = 0;

  readonly formatCop = formatCop;
  readonly packMax = PACK_MAX;
  readonly steps = [
    { n: 1, title: 'Excel Autobits', hint: 'Compra, fecha, proveedor y valor de la semana.' },
    { n: 2, title: 'Facturas + Claude', hint: `Hasta ${PACK_MAX} por paquete. Claude extrae y relaciona.` },
  ];
  readonly chatSugerencias = [
    'Resume cada factura: proveedor, número, fecha y total.',
    '¿Cuáles necesitan revisión y por qué? Lista ambigüedades.',
    'Lista NIT, compra y reserva detectados.',
    'Compara totales de facturas contra Autobits.',
  ];

  paso = signal(1);
  limpiando = signal(false);
  confirmandoVaciar = signal(false);
  error = signal('');
  aviso = signal('');

  subiendoAutobits = signal(false);
  autobits = signal<ImportResult | null>(null);
  records = signal<AutobitsRecord[]>([]);
  verTodosRecords = signal(false);

  generandoExcel = signal(false);

  subiendoFacturas = signal(false);
  facturaItems = signal<BatchUploadItem[]>([]);
  /** IDs del paquete actual / última consulta IA. El Excel no usa el listado global. */
  idsFacturasOperacion = signal<number[]>([]);
  documentos = signal<DocumentSummary[]>([]);
  crossings = signal<CrossingSummary[]>([]);
  packMsg = signal('');
  solicitud = '';
  chatInput = '';
  chatMsgs = signal<ChatMsg[]>([]);
  preguntando = signal(false);

  private poll?: Subscription;
  private autobitsUpload?: Subscription;

  ngOnInit(): void {
    sessionStorage.setItem(SESSION_KEY, '1');
    this.restaurarIdsPaquete();
    this.restaurar();
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
    this.autobitsUpload?.unsubscribe();
  }

  readonly recordsVista = computed(() => {
    const all = this.records();
    return this.verTodosRecords() ? all : all.slice(0, 12);
  });

  readonly facturasRevision = computed(() =>
    this.documentos().filter((d) => d.requiere_revision)
  );

  readonly idsParaExcel = computed(() => {
    const operacion = this.idsFacturasOperacion().filter(
      (id): id is number => typeof id === 'number' && Number.isFinite(id),
    );
    if (operacion.length) {
      return operacion;
    }
    return this.facturaItems()
      .map((item) => item.document?.id)
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
  });

  readonly idsListosParaExcel = computed(() => {
    const blocked = new Set(['RECIBIDO', 'PROCESANDO']);
    const byId = new Map(this.documentos().map((d) => [d.id, d]));
    return this.idsParaExcel().filter((id) => {
      const doc = byId.get(id);
      if (!doc) {
        return true;
      }
      return !blocked.has((doc.estado || '').toUpperCase());
    });
  });

  readonly facturasEnProceso = computed(() => {
    const ids = new Set(this.idsParaExcel());
    const pool = ids.size
      ? this.documentos().filter((d) => ids.has(d.id))
      : this.documentos();
    return pool.some((d) =>
      ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
    );
  });

  readonly puedeGenerarExcel = computed(() => {
    if (this.generandoExcel()) {
      return false;
    }
    return this.idsListosParaExcel().length > 0 && !this.facturasEnProceso();
  });

  readonly kpis = computed(() => ({
    autobits: this.autobits()?.imported_rows || this.records().length,
    facturas: this.documentos().length,
    revision: this.facturasRevision().length,
    pack: this.idsParaExcel().length,
  }));

  vaciarImportados(): void {
    if (this.limpiando()) {
      return;
    }
    this.confirmandoVaciar.set(true);
  }

  cancelarVaciar(): void {
    this.confirmandoVaciar.set(false);
  }

  confirmarVaciar(): void {
    if (this.limpiando()) {
      return;
    }
    this.confirmandoVaciar.set(false);
    this.restoreSeq += 1;
    this.limpiando.set(true);
    this.error.set('');
    this.autobitsApi.purgeExcels(true).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.limpiando.set(false)),
    ).subscribe({
      next: () => {
        this.resetLocal();
        this.aviso.set('Cargas anteriores vaciadas. Empieza por Autobits.');
      },
      error: (err) => {
        this.error.set(this.detalleError(err, 'No se pudieron vaciar las cargas.'));
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeVaciar(): void {
    if (this.confirmandoVaciar()) {
      this.cancelarVaciar();
    }
  }

  onAutobits(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.restoreSeq += 1;
    this.error.set('');
    this.aviso.set('Leyendo el Excel de Autobits…');
    // Cancelar primero: el finalize del upload anterior no debe apagar el loading del nuevo.
    this.autobitsUpload?.unsubscribe();
    this.subiendoAutobits.set(true);
    this.autobitsUpload = this.autobitsApi.uploadDirect(file, true).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.subiendoAutobits.set(false)),
    ).subscribe({
      next: (res) => {
        this.aplicarAutobits(res);
        this.paso.set(2);
      },
      error: (err) => {
        this.error.set(this.detalleError(err, 'No se pudo leer el Excel de Autobits.'));
        this.aviso.set('');
      },
    });
  }

  async generarExcel(): Promise<void> {
    if (this.generandoExcel() || !this.puedeGenerarExcel()) return;
    this.generandoExcel.set(true);
    this.error.set('');
    this.aviso.set('Generando Excel de cruce del paquete…');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const documentIds = [...this.idsListosParaExcel()];
      if (!documentIds.length) {
        this.error.set('Espere a que Claude termine de leer las facturas del paquete.');
        return;
      }
      await this.download.download(
        this.docsApi.exportExcelUrl(documentIds),
        `Facturas_Autobits_${today}.xlsx`,
      );
      this.aviso.set('Excel de cruce descargado.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo generar el Excel.');
    } finally {
      this.generandoExcel.set(false);
    }
  }

  onFacturas(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    (ev.target as HTMLInputElement).value = '';
    if (!files.length) return;
    if (!this.autobits()) {
      this.error.set('Carga Autobits antes de subir facturas.');
      return;
    }
    if (files.length > PACK_MAX) {
      this.error.set(
        `Máximo ${PACK_MAX} facturas por paquete. Seleccionaste ${files.length}. Divide la carga.`
      );
      return;
    }
    this.subiendoFacturas.set(true);
    this.error.set('');
    this.aviso.set(`Subiendo ${files.length} factura(s) y encolando OCR/IA…`);
    this.docsApi.uploadBatch(files, 'FACTURA', PACK_MAX, this.solicitud).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.subiendoFacturas.set(false)),
    ).subscribe({
      next: (res) => {
        this.facturaItems.set([...(res.items || [])]);
        this.persistirIdsPaquete(this.idsDePaquete(res.queued_ids, res.items));
        this.packMsg.set(res.mensaje);
        if (res.total_duplicados) {
          this.aviso.set(
            `${res.total_recibidos} recibidas · ${res.total_duplicados} duplicado(s) rechazados.`
          );
        } else {
          this.aviso.set(res.mensaje);
        }
        if (this.solicitud.trim()) {
          this.chatMsgs.update((msgs) => [
            ...msgs,
            { role: 'user', text: this.solicitud.trim() },
            {
              role: 'ia',
              text: 'Pedido aplicado al paquete. Cuando termine el OCR te responderé con los datos extraídos.',
            },
          ]);
        }
        this.refrescarFacturas();
        this.startPoll();
        this.paso.set(2);
      },
      error: (err) => {
        this.error.set(this.detalleError(err, 'No se pudieron subir las facturas.'));
      },
    });
  }

  usarSugerencia(texto: string): void {
    this.chatInput = texto;
    this.preguntar();
  }

  preguntar(): void {
    const pregunta = this.chatInput.trim();
    if (!pregunta || this.preguntando()) return;
    const ids = this.idsParaExcel().slice(0, PACK_MAX);
    if (!ids.length) {
      this.error.set('Sube el paquete de facturas para preguntar a la IA. El chat no usa el listado global.');
      return;
    }
    this.preguntando.set(true);
    this.chatInput = '';
    this.chatMsgs.update((msgs) => [...msgs, { role: 'user', text: pregunta }]);
    this.persistirIdsPaquete(ids);
    this.docsApi.ask(pregunta, ids).subscribe({
      next: (res) => {
        this.preguntando.set(false);
        const texto = res.ok
          ? res.respuesta
          : res.error || 'La IA no pudo responder.';
        this.chatMsgs.update((msgs) => [...msgs, { role: 'ia', text: texto }]);
      },
      error: (err) => {
        this.preguntando.set(false);
        this.chatMsgs.update((msgs) => [
          ...msgs,
          { role: 'ia', text: this.detalleError(err, 'No se pudo consultar la IA.') },
        ]);
      },
    });
  }

  tonoEstado(estado: string): string {
    const e = (estado || '').toUpperCase();
    if (e === 'REQUIERE_REVISION' || e === 'DUPLICADO') return 'warn';
    if (e === 'ERROR') return 'bad';
    if (['EXTRAIDO', 'PROCESADO', 'APROBADO'].includes(e)) return 'ok';
    return '';
  }

  private anclarPaqueteSiFalta(items: DocumentSummary[]): void {
    if (this.idsFacturasOperacion().length || this.facturaItems().length) {
      return;
    }
    const blocked = new Set(['ANULADO', 'DUPLICADO', 'RECIBIDO', 'PROCESANDO']);
    const ready = items
      .filter((d) => typeof d.id === 'number' && !blocked.has((d.estado || '').toUpperCase()))
      .map((d) => d.id)
      .slice(0, PACK_MAX);
    if (ready.length) {
      this.persistirIdsPaquete(ready);
    }
  }

  private persistirIdsPaquete(ids: number[]): void {
    const clean = ids.filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);
    this.idsFacturasOperacion.set(clean);
    try {
      if (clean.length) {
        sessionStorage.setItem(PACK_IDS_KEY, JSON.stringify(clean));
      } else {
        sessionStorage.removeItem(PACK_IDS_KEY);
      }
    } catch {
      /* sessionStorage puede estar bloqueado en tests o modo privado */
    }
  }

  private restaurarIdsPaquete(): void {
    try {
      const raw = sessionStorage.getItem(PACK_IDS_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      this.idsFacturasOperacion.set(
        parsed.filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0),
      );
    } catch {
      /* JSON inválido o storage no disponible */
    }
  }

  private idsDePaquete(
    queued: number[] | undefined,
    items: BatchUploadItem[] | undefined,
  ): number[] {
    const fromQueued = (queued || []).filter((id) => Number.isFinite(id) && id > 0);
    if (fromQueued.length) {
      return fromQueued;
    }
    return (items || [])
      .map((item) => item.document?.id)
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);
  }

  private aplicarAutobits(res: ImportResult): void {
    this.autobits.set({ ...res, records: [...(res.records || [])] });
    const fromRes = [...(res.records || [])];
    this.records.set(fromRes);
    if (!fromRes.length) {
      this.cargarRecords();
    }
    const reused = res.reused ? ' (ya estaba importado; no se vació nada)' : '';
    this.aviso.set(
      res.aviso ||
        `${res.imported_rows} filas de Autobits${reused}. Fecha, cliente y compra listas.`
    );
    if (res.parse_errors?.length) {
      this.error.set(res.parse_errors.slice(0, 3).join(' · '));
    }
  }

  private resetLocal(): void {
    this.autobits.set(null);
    this.records.set([]);
    this.facturaItems.set([]);
    this.persistirIdsPaquete([]);
    this.documentos.set([]);
    this.crossings.set([]);
    this.chatMsgs.set([]);
    this.packMsg.set('');
    this.paso.set(1);
  }

  private cargarRecords(): void {
    const seq = this.restoreSeq;
    const batchId = this.autobits()?.batch?.id;
    this.autobitsApi.listRecords({ batch_id: batchId, limit: 200 }).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (res) => {
        if (seq !== this.restoreSeq) return;
        this.records.set([...(res.items || [])]);
      },
      error: () => {
        if (seq !== this.restoreSeq) return;
        if (!this.records().length) this.records.set([]);
      },
    });
  }

  private refrescarFacturas(): void {
    this.docsApi.list({ limit: 200 }).subscribe({
      next: (res) => {
        const items = res.items || [];
        this.documentos.set(items);
        this.anclarPaqueteSiFalta(items);
      },
      error: () => undefined,
    });
    this.crossingsApi.list({ limit: 200, batch_id: this.autobits()?.batch?.id }).subscribe({
      next: (res) => this.crossings.set(res.items || []),
      error: () => undefined,
    });
  }

  private startPoll(): void {
    this.poll?.unsubscribe();
    this.poll = interval(4000).subscribe(() => {
      this.refrescarFacturas();
      const pending = this.documentos().some((d) =>
        ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
      );
      if (!pending && this.documentos().length) {
        this.poll?.unsubscribe();
        this.crossingsApi.runMatching(this.autobits()?.batch?.id).subscribe({
          next: () => this.refrescarFacturas(),
        });
      }
    });
  }

  private restaurar(): void {
    const seq = this.restoreSeq;
    this.autobitsApi.getLatestBatch().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (batch) => {
        if (seq !== this.restoreSeq) return;
        this.autobits.set({
          batch,
          imported_rows: batch.imported_rows,
          skipped_duplicates: 0,
          skipped_empty: 0,
          parse_errors: [],
        });
        this.cargarRecords();
        this.paso.set(2);
        this.refrescarFacturas();
      },
      error: () => {
        if (seq !== this.restoreSeq) return;
        this.paso.set(1);
      },
    });
  }

  private detalleError(err: { error?: { detail?: unknown; message?: string } }, fallback: string): string {
    const d = err?.error?.detail ?? err?.error?.message;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d
        .map((x) => (typeof x === 'string' ? x : (x as { msg?: string })?.msg || ''))
        .filter(Boolean)
        .join(' ');
    }
    if (d && typeof d === 'object' && 'message' in d) {
      return String((d as { message: string }).message);
    }
    return fallback;
  }
}
