import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
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
  private readonly cruceApi = inject(CruceExcelApiService);
  private readonly docsApi = inject(DocumentsApiService);
  private readonly crossingsApi = inject(CrossingsApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Invalida restauraciones HTTP que lleguen después de una acción del usuario. */
  private restoreSeq = 0;

  readonly formatCop = formatCop;
  readonly packMax = PACK_MAX;
  readonly steps = [
    { n: 1, title: 'Excel Autobits', hint: 'De ahí salen compra, fecha, cliente y valor.' },
    { n: 2, title: 'Excel de cruces', hint: 'CRUCE DE CUENTAS: FACTURA/CDC y fecha de pago.' },
    { n: 3, title: 'Facturas + chat IA', hint: `Hasta ${PACK_MAX} por paquete. Pide lo que necesites.` },
  ];
  readonly chatSugerencias = [
    'Resume cada factura: proveedor, número, fecha y total.',
    '¿Cuáles necesitan revisión y por qué? Lista ambigüedades.',
    'Lista NIT, compra y reserva detectados.',
    'Compara totales de facturas contra Autobits.',
  ];

  paso = signal(1);
  limpiando = signal(false);
  error = signal('');
  aviso = signal('');

  subiendoAutobits = signal(false);
  autobits = signal<ImportResult | null>(null);
  records = signal<AutobitsRecord[]>([]);
  verTodosRecords = signal(false);

  subiendoCruce = signal(false);
  cruce = signal<CruceUploadResult | null>(null);
  comparacion = signal<ComparacionFila[]>([]);

  subiendoFacturas = signal(false);
  facturaItems = signal<BatchUploadItem[]>([]);
  documentos = signal<DocumentSummary[]>([]);
  crossings = signal<CrossingSummary[]>([]);
  packMsg = signal('');
  soloPendientes = signal(true);
  copiado = signal('');
  solicitud = '';
  chatInput = '';
  chatMsgs = signal<ChatMsg[]>([]);
  preguntando = signal(false);

  private poll?: Subscription;
  private autobitsUpload?: Subscription;

  ngOnInit(): void {
    sessionStorage.setItem(SESSION_KEY, '1');
    this.restaurar();
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
    this.autobitsUpload?.unsubscribe();
  }

  readonly pendientesLista = computed(() => {
    const por = this.cruce()?.pendientes?.por_tipo || {};
    return Object.values(por).flat() as PendienteItem[];
  });

  readonly comparacionVista = computed(() => {
    const rows = this.comparacion();
    if (!this.soloPendientes()) return rows;
    return rows.filter((r) => r.faltas?.length);
  });

  readonly recordsVista = computed(() => {
    const all = this.records();
    return this.verTodosRecords() ? all : all.slice(0, 12);
  });

  readonly facturasRevision = computed(() =>
    this.documentos().filter((d) => d.requiere_revision)
  );

  readonly kpis = computed(() => {
    const cmp = this.comparacion();
    const incompletas = cmp.filter((r) => r.faltas?.length).length;
    return {
      autobits: this.autobits()?.imported_rows || this.records().length,
      cruce: this.cruce()?.lectura?.filas_leidas || 0,
      incompletas,
      completas: Math.max(0, cmp.length - incompletas),
      facturas: this.documentos().length,
      revision: this.facturasRevision().length,
    };
  });

  vaciarImportados(): void {
    if (!this.pedirConfirmacionVaciar()) {
      return;
    }
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

  /** Separado para poder cubrir confirmar/cancelar en tests sin `window.confirm`. */
  pedirConfirmacionVaciar(): boolean {
    return window.confirm(
      'Esto borra Autobits, el Excel de cruce y las facturas importadas. ¿Seguro?'
    );
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

  onCruce(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    if (!this.autobits()) {
      this.error.set('Primero sube el Excel de Autobits.');
      return;
    }
    this.subiendoCruce.set(true);
    this.error.set('');
    this.aviso.set('Conciliando con Autobits…');
    this.cruceApi.upload(file, true).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.subiendoCruce.set(false)),
    ).subscribe({
      next: (res) => {
        this.cruce.set(res);
        this.comparacion.set([...(res.comparacion || [])]);
        const n = res.comparacion?.filter((r) => r.faltas?.length).length || 0;
        this.aviso.set(
          res.reused
            ? `Se reutilizó el cruce ya cargado (${res.archivo}). ${n} fila(s) con datos faltantes.`
            : `Cruce leído: ${res.lectura.filas_leidas} filas. ${n} con datos faltantes o ambiguos.`
        );
        this.paso.set(3);
      },
      error: (err) => {
        this.error.set(this.detalleError(err, 'No se pudo leer el Excel de cruces.'));
      },
    });
  }

  onFacturas(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    (ev.target as HTMLInputElement).value = '';
    if (!files.length) return;
    if (!this.autobits()) {
      this.error.set('Primero sube Autobits y el cruce.');
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
    if (!this.documentos().length) {
      this.error.set('Sube al menos una factura del paquete para preguntar a la IA.');
      return;
    }
    this.preguntando.set(true);
    this.chatInput = '';
    this.chatMsgs.update((msgs) => [...msgs, { role: 'user', text: pregunta }]);
    const ids = this.documentos()
      .map((d) => d.id)
      .slice(0, PACK_MAX);
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

  copiar(texto: string): void {
    if (!texto) return;
    navigator.clipboard?.writeText(texto);
    this.copiado.set(texto);
    this.aviso.set(
      'Copiado. Pégalo en el Excel: FECHA · COMPRA · REF · VALOR · FACTURA/CDC · FECHA DE PAGO.'
    );
  }

  copiarPendientes(): void {
    const lineas = this.comparacionVista()
      .map((r) => r.copiar)
      .filter(Boolean);
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

  tonoEstado(estado: string): string {
    const e = (estado || '').toUpperCase();
    if (e === 'REQUIERE_REVISION' || e === 'DUPLICADO') return 'warn';
    if (e === 'ERROR') return 'bad';
    if (['EXTRAIDO', 'PROCESADO', 'APROBADO'].includes(e)) return 'ok';
    return '';
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
    this.cruce.set(null);
    this.comparacion.set([]);
    this.facturaItems.set([]);
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
      next: (res) => this.documentos.set(res.items || []),
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
        this.cruceApi.getPendientes(batch.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (p) => {
            if (seq !== this.restoreSeq) return;
            this.comparacion.set(p.comparacion || []);
            if (p.ultimo_cruce?.archivo && p.batch) {
              this.cruce.set({
                aplicado: !!p.ultimo_cruce.aplicado,
                archivo: p.ultimo_cruce.archivo,
                batch: p.batch,
                lectura: {
                  filas_leidas: (p.comparacion || []).length,
                  filas_duplicadas: 0,
                  hojas: [],
                  avisos: [],
                },
                conciliacion: {
                  emparejadas: (p.comparacion || []).filter(
                    (r) =>
                      !r.faltas.includes(
                        'Esta fila de Autobits no está en el Excel de cruce'
                      )
                  ).length,
                  sin_correspondencia: p.ultimo_cruce.sobrantes || 0,
                  fuera_de_periodo: 0,
                  sin_fecha: 0,
                  actualizadas: 0,
                  conflictos: [],
                },
                comparacion: p.comparacion || [],
                pendientes: p.pendientes,
              });
              this.paso.set(3);
            } else if (p.has_autobits) {
              this.paso.set(2);
            }
          },
        });
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
