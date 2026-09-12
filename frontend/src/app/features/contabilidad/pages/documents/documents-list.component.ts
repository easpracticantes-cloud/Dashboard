import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  BatchUploadItem,
  BatchUploadResponse,
  DocumentSummary,
  DocumentsApiService,
} from '../../services/documents-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import {
  formatCop,
  formatFechaContable,
  iconEstado,
  labelEstado,
  toneEstado,
} from '../../utils/contabilidad-labels';

const PACK_SIZE = 25;
const POLL_MS = 4000;
const PACK_IDS_KEY = 'contab-facturas-pack-ids';

interface ChatMsg {
  role: 'user' | 'ia';
  text: string;
}

@Component({
  selector: 'eas-contabilidad-documents-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './documents-list.component.html',
  styleUrl: './documents-list.component.scss',
})
export class DocumentsListComponent implements OnInit, OnDestroy {
  documentos: DocumentSummary[] = [];
  total = 0;
  cargando = true;
  error = '';
  filtroEstado = '';
  filtroBusqueda = '';
  subiendo = false;

  loteMensaje = '';
  loteResumen: BatchUploadResponse | null = null;
  loteItems: BatchUploadItem[] = [];
  loteIds = new Set<number>();
  packActual = 0;
  packTotal = 0;
  archivosEnCola = 0;

  generandoExcel = false;
  excelEstado: '' | 'generando' | 'generado' | 'error' = '';
  excelError = '';

  chatInput = '';
  chatMsgs: ChatMsg[] = [];
  preguntando = false;

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly formatCop = formatCop;
  readonly formatFechaContable = formatFechaContable;
  readonly labelEstado = labelEstado;
  readonly toneEstado = toneEstado;
  readonly iconEstado = iconEstado;
  readonly packSize = PACK_SIZE;

  estados = [
    '',
    'RECIBIDO',
    'PROCESANDO',
    'EXTRAIDO',
    'PROCESADO',
    'REQUIERE_REVISION',
    'DUPLICADO',
    'APROBADO',
    'ERROR',
  ];

  constructor(
    private readonly api: DocumentsApiService,
    private readonly download: ContabilidadDownloadService,
  ) {}

  ngOnInit(): void {
    this.restaurarIdsPaquete();
    this.cargar();
  }

  ngOnDestroy(): void {
    this.stopPoll();
  }

  get procesandoCount(): number {
    return this.documentos.filter((d) => (d.estado || '').toUpperCase() === 'PROCESANDO').length;
  }

  get loteOkCount(): number {
    return this.loteItems.filter((i) => i.ok && !i.duplicate_warning).length;
  }

  get destacados(): DocumentSummary[] {
    if (!this.loteIds.size) return [];
    return this.documentos.filter((d) => this.loteIds.has(d.id));
  }

  get idsParaExcel(): number[] {
    return [...this.loteIds].filter((id) => Number.isFinite(id) && id > 0);
  }

  get idsListosParaExcel(): number[] {
    const blocked = new Set(['RECIBIDO', 'PROCESANDO']);
    const byId = new Map(this.documentos.map((d) => [d.id, d]));
    return this.idsParaExcel.filter((id) => {
      const doc = byId.get(id);
      if (!doc) return true;
      return !blocked.has((doc.estado || '').toUpperCase());
    });
  }

  get facturasEnProceso(): boolean {
    if (!this.loteIds.size) return false;
    return this.documentos.some(
      (d) =>
        this.loteIds.has(d.id) &&
        ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase()),
    );
  }

  get puedeGenerarExcel(): boolean {
    return !this.generandoExcel && this.idsListosParaExcel.length > 0 && !this.facturasEnProceso;
  }

  cargar(silent = false): void {
    if (!silent) {
      this.cargando = true;
      this.error = '';
    }
    this.api
      .list({
        limit: 200,
        estado: this.filtroEstado || undefined,
        search: this.filtroBusqueda || undefined,
      })
      .subscribe({
        next: (res) => {
          this.documentos = res.items;
          this.total = res.total;
          this.cargando = false;
          const still = this.documentos.some(
            (d) =>
              this.loteIds.has(d.id) &&
              ['PROCESANDO', 'RECIBIDO'].includes((d.estado || '').toUpperCase())
          );
          if (!still && this.loteIds.size) {
            this.stopPoll();
            this.packActual = this.packTotal;
          }
        },
        error: () => {
          if (!silent) {
            this.error = 'No se pudieron cargar los documentos.';
          }
          this.cargando = false;
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    this.subirLote(files);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      /\.(jpe?g|png|pdf)$/i.test(f.name)
    );
    if (!files.length) {
      this.error = 'Solo se aceptan JPG, PNG o PDF.';
      return;
    }
    this.subirLote(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private subirLote(files: File[]): void {
    if (files.length > PACK_SIZE) {
      this.error = `Máximo ${PACK_SIZE} facturas por paquete. Seleccionaste ${files.length}. Divide la carga.`;
      return;
    }
    this.subiendo = true;
    this.error = '';
    this.loteMensaje = '';
    this.loteResumen = null;
    this.loteItems = [];
    this.loteIds = new Set();
    this.archivosEnCola = files.length;
    this.packTotal = Math.ceil(files.length / PACK_SIZE) || 0;
    this.packActual = 0;
    this.excelEstado = '';
    this.excelError = '';
    this.chatMsgs = [];

    this.api.uploadBatch(files, 'FACTURA', PACK_SIZE).subscribe({
      next: (res) => {
        this.subiendo = false;
        this.loteResumen = res;
        this.loteItems = res.items || [];
        this.loteMensaje = res.mensaje;
        this.packTotal = res.packs || this.packTotal;
        this.packActual = res.queued_ids?.length ? 1 : 0;
        this.persistirIdsPaquete(this.idsDePaquete(res.queued_ids, res.items));
        this.cargar();
        if (res.queued_ids?.length) {
          this.startPoll();
        }
      },
      error: (err) => {
        this.subiendo = false;
        this.error =
          err?.error?.detail ||
          'No se pudo subir el lote. Pruebe con menos archivos o revise el tamaño.';
      },
    });
  }

  reprocesarPendientes(): void {
    const ids = this.documentos
      .filter((d) =>
        ['RECIBIDO', 'ERROR', 'REQUIERE_REVISION', 'PROCESANDO'].includes(
          (d.estado || '').toUpperCase()
        )
      )
      .map((d) => d.id);
    if (!ids.length) {
      this.loteMensaje = 'No hay documentos pendientes de reprocesar.';
      return;
    }
    this.api.processBatch(ids, PACK_SIZE).subscribe({
      next: (res) => {
        this.loteMensaje = res.mensaje;
        this.packTotal = res.packs;
        this.packActual = 1;
        this.persistirIdsPaquete(ids);
        this.cargar();
        this.startPoll();
      },
      error: (err) => {
        this.error = err?.error?.detail || 'No se pudo encolar el reproceso.';
      },
    });
  }

  private startPoll(): void {
    this.stopPoll();
    this.pollTimer = setInterval(() => this.cargar(true), POLL_MS);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  esDelLote(id: number): boolean {
    return this.loteIds.has(id);
  }

  async generarExcel(): Promise<void> {
    if (!this.puedeGenerarExcel) return;
    const documentIds = [...this.idsListosParaExcel];
    if (!documentIds.length) {
      this.excelEstado = 'error';
      this.excelError = 'Espere a que terminen de analizarse las facturas del paquete.';
      return;
    }
    this.generandoExcel = true;
    this.excelEstado = 'generando';
    this.excelError = '';
    try {
      const today = new Date().toISOString().slice(0, 10);
      await this.download.download(
        this.api.exportExcelUrl(documentIds),
        `Facturas_Autobits_${today}.xlsx`,
      );
      this.excelEstado = 'generado';
    } catch (err) {
      this.excelEstado = 'error';
      this.excelError = err instanceof Error ? err.message : 'No se pudo generar el Excel.';
    } finally {
      this.generandoExcel = false;
    }
  }

  preguntarIA(): void {
    const pregunta = this.chatInput.trim();
    if (!pregunta || this.preguntando) return;
    const ids = this.idsParaExcel;
    this.chatInput = '';
    this.chatMsgs = [...this.chatMsgs, { role: 'user', text: pregunta }];
    this.preguntando = true;
    this.api.ask(pregunta, ids).subscribe({
      next: (res) => {
        this.preguntando = false;
        this.chatMsgs = [
          ...this.chatMsgs,
          { role: 'ia', text: res.ok ? res.respuesta : res.error || 'La IA no pudo responder.' },
        ];
      },
      error: (err) => {
        this.preguntando = false;
        this.chatMsgs = [
          ...this.chatMsgs,
          {
            role: 'ia',
            text: err?.error?.detail || 'No se pudo consultar la IA sobre este paquete.',
          },
        ];
      },
    });
  }

  private persistirIdsPaquete(ids: number[]): void {
    const clean = ids.filter((id) => Number.isFinite(id) && id > 0);
    this.loteIds = new Set(clean);
    try {
      if (clean.length) {
        sessionStorage.setItem(PACK_IDS_KEY, JSON.stringify(clean));
      } else {
        sessionStorage.removeItem(PACK_IDS_KEY);
      }
    } catch {
      /* sessionStorage puede estar bloqueado */
    }
  }

  private restaurarIdsPaquete(): void {
    try {
      const raw = sessionStorage.getItem(PACK_IDS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.loteIds = new Set(
        parsed.filter((id: unknown): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0),
      );
    } catch {
      /* JSON inválido */
    }
  }

  private idsDePaquete(
    queued: number[] | undefined,
    items: BatchUploadItem[] | undefined,
  ): number[] {
    const fromQueued = (queued || []).filter((id) => Number.isFinite(id) && id > 0);
    if (fromQueued.length) return fromQueued;
    return (items || [])
      .map((item) => item.document?.id)
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);
  }
}
