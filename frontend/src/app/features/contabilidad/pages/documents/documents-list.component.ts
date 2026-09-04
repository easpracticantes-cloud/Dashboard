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
import {
  formatCop,
  formatFechaContable,
  iconEstado,
  labelEstado,
  toneEstado,
} from '../../utils/contabilidad-labels';

const PACK_SIZE = 25;
const POLL_MS = 4000;

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

  constructor(private readonly api: DocumentsApiService) {}

  ngOnInit(): void {
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
    this.subiendo = true;
    this.error = '';
    this.loteMensaje = '';
    this.loteResumen = null;
    this.loteItems = [];
    this.loteIds = new Set();
    this.archivosEnCola = files.length;
    this.packTotal = Math.ceil(files.length / PACK_SIZE) || 0;
    this.packActual = 0;

    this.api.uploadBatch(files, 'FACTURA', PACK_SIZE).subscribe({
      next: (res) => {
        this.subiendo = false;
        this.loteResumen = res;
        this.loteItems = res.items || [];
        this.loteMensaje = res.mensaje;
        this.packTotal = res.packs || this.packTotal;
        this.packActual = res.queued_ids?.length ? 1 : 0;
        for (const id of res.queued_ids || []) {
          this.loteIds.add(id);
        }
        for (const item of res.items || []) {
          if (item.document?.id) this.loteIds.add(item.document.id);
        }
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
        this.loteIds = new Set(ids);
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
}
