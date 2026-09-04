import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  BatchUploadItem,
  BatchUploadResponse,
  DocumentSummary,
  DocumentsApiService,
} from '../../services/documents-api.service';
import {
  FacturasApiService,
  HealthResponse,
} from '../../services/facturas-api.service';
import { iconEstado, labelEstado, toneEstado } from '../../utils/contabilidad-labels';

interface ArchivoLocal {
  file: File;
  previewUrl: string;
}

interface ResultadoLote {
  archivo: string;
  ok: boolean;
  documentId?: number;
  estado?: string;
  error?: string;
  duplicate?: boolean;
}

const PACK_SIZE = 25;
const POLL_MS = 4000;

@Component({
  selector: 'eas-contabilidad-processing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './processing.component.html',
  styleUrl: './processing.component.scss',
})
export class ProcessingComponent implements OnInit, OnDestroy {
  private readonly docsApi = inject(DocumentsApiService);
  private readonly healthApi = inject(FacturasApiService);

  archivos: ArchivoLocal[] = [];
  seleccionIndex = 0;
  procesando = false;
  estado = 'Listo para cargar y procesar facturas (OCR + IA).';
  resultados: ResultadoLote[] = [];
  errorGlobal = '';
  health: HealthResponse | null = null;
  arrastrando = false;
  progreso = 0;

  loteResumen: BatchUploadResponse | null = null;
  loteItems: BatchUploadItem[] = [];
  queuedIds: number[] = [];
  documentosLote: DocumentSummary[] = [];
  packActual = 0;
  packTotal = 0;

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly packSize = PACK_SIZE;
  readonly labelEstado = labelEstado;
  readonly toneEstado = toneEstado;
  readonly iconEstado = iconEstado;

  ngOnInit(): void {
    this.healthApi.health().subscribe({
      next: (h) => {
        this.health = h;
        if (!h.ok) {
          this.estado = h.errores?.join(' ') || 'Motor OCR/IA con incidencias.';
        }
      },
      error: () => {
        this.estado =
          'No se pudo consultar el estado OCR/IA. Puede continuar; el procesamiento reportará errores por archivo.';
      },
    });
  }

  ngOnDestroy(): void {
    this.limpiarPreviews();
    this.stopPoll();
  }

  get archivoActivo(): ArchivoLocal | null {
    return this.archivos[this.seleccionIndex] ?? null;
  }

  get resultadoActivo(): ResultadoLote | null {
    if (!this.resultados.length) return null;
    const nombre = this.archivoActivo?.file.name;
    return this.resultados.find((r) => r.archivo === nombre) ?? this.resultados[0] ?? null;
  }

  get kpiOk(): number {
    return this.documentosLote.filter((d) =>
      ['EXTRAIDO', 'PROCESADO', 'APROBADO', 'REQUIERE_REVISION'].includes(
        (d.estado || '').toUpperCase()
      )
    ).length;
  }

  get kpiErrores(): number {
    return (
      this.documentosLote.filter((d) => (d.estado || '').toUpperCase() === 'ERROR').length +
      this.resultados.filter((r) => !r.ok && !r.documentId).length
    );
  }

  get kpiPendientes(): number {
    return this.documentosLote.filter((d) =>
      ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
    ).length;
  }

  get kpiDuplicados(): number {
    return this.documentosLote.filter((d) => (d.estado || '').toUpperCase() === 'DUPLICADO')
      .length;
  }

  resultadoDe(nombre: string): ResultadoLote | undefined {
    return this.resultados.find((r) => r.archivo === nombre);
  }

  iconoArchivo(nombre: string): string {
    const r = this.resultadoDe(nombre);
    if (!r) return 'description';
    if (r.duplicate) return 'content_copy';
    return r.ok ? 'check_circle' : 'error';
  }

  seleccionarPorNombre(nombre: string): void {
    const idx = this.archivos.findIndex((a) => a.file.name === nombre);
    if (idx >= 0) this.seleccionIndex = idx;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = false;
    const files = event.dataTransfer?.files;
    if (files?.length) this.agregarArchivos(Array.from(files));
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.agregarArchivos(Array.from(input.files));
      input.value = '';
    }
  }

  agregarArchivos(files: File[]): void {
    const validos = files.filter((f) => /\.(jpg|jpeg|png|pdf)$/i.test(f.name));
    for (const file of validos) {
      if (this.archivos.some((a) => a.file.name === file.name && a.file.size === file.size)) {
        continue;
      }
      this.archivos.push({
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      });
    }
    if (this.archivos.length) {
      this.seleccionIndex = this.archivos.length - 1;
      this.estado = `${this.archivos.length} archivo(s) listo(s) · paquetes de ${PACK_SIZE}.`;
    }
  }

  seleccionar(index: number): void {
    this.seleccionIndex = index;
  }

  quitar(index: number, event?: Event): void {
    event?.stopPropagation();
    const [removed] = this.archivos.splice(index, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    if (this.seleccionIndex >= this.archivos.length) {
      this.seleccionIndex = Math.max(0, this.archivos.length - 1);
    }
    this.estado = this.archivos.length
      ? `${this.archivos.length} archivo(s) listo(s).`
      : 'Lista vacía.';
  }

  limpiar(): void {
    this.stopPoll();
    this.limpiarPreviews();
    this.archivos = [];
    this.resultados = [];
    this.errorGlobal = '';
    this.seleccionIndex = 0;
    this.progreso = 0;
    this.loteResumen = null;
    this.loteItems = [];
    this.queuedIds = [];
    this.documentosLote = [];
    this.packActual = 0;
    this.packTotal = 0;
    this.estado = 'Lista vacía.';
  }

  procesar(): void {
    if (this.procesando) return;
    if (!this.archivos.length) {
      this.errorGlobal = 'Agregue al menos una factura (JPG, PNG o PDF).';
      return;
    }

    this.procesando = true;
    this.errorGlobal = '';
    this.resultados = [];
    this.documentosLote = [];
    this.progreso = 8;
    this.packTotal = Math.ceil(this.archivos.length / PACK_SIZE) || 0;
    this.packActual = 0;
    this.estado = `Subiendo ${this.archivos.length} archivo(s) en paquetes de ${PACK_SIZE}…`;

    this.docsApi
      .uploadBatch(
        this.archivos.map((a) => a.file),
        'FACTURA',
        PACK_SIZE
      )
      .subscribe({
        next: (res) => {
          this.loteResumen = res;
          this.loteItems = res.items || [];
          this.queuedIds = res.queued_ids || [];
          this.packTotal = res.packs || this.packTotal;
          this.packActual = this.queuedIds.length ? 1 : this.packTotal;
          this.progreso = 35;
          this.resultados = (res.items || []).map((item) => ({
            archivo: item.filename,
            ok: item.ok,
            documentId: item.document?.id,
            estado: item.document?.estado,
            error: item.error || undefined,
            duplicate: !!item.duplicate_warning,
          }));
          this.estado = res.mensaje || `${this.queuedIds.length} en cola OCR/IA.`;
          if (this.queuedIds.length) {
            this.startPoll();
          } else {
            this.procesando = false;
            this.progreso = 100;
          }
          this.refreshDocs();
        },
        error: (err) => {
          this.procesando = false;
          this.progreso = 0;
          this.errorGlobal =
            err?.error?.detail || err?.message || 'No se pudo completar la carga masiva.';
          this.estado = 'Error al subir el lote.';
        },
      });
  }

  reprocesarPendientes(): void {
    const ids = this.documentosLote
      .filter((d) =>
        ['RECIBIDO', 'ERROR', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
      )
      .map((d) => d.id);
    if (!ids.length) {
      this.errorGlobal = 'No hay documentos pendientes de reprocesar en este lote.';
      return;
    }
    this.procesando = true;
    this.errorGlobal = '';
    this.estado = `Reprocesando ${ids.length} documento(s)…`;
    this.docsApi.processBatch(ids, PACK_SIZE).subscribe({
      next: (res) => {
        this.packTotal = res.packs || 1;
        this.packActual = 1;
        this.progreso = 40;
        this.estado = res.mensaje || 'Reproceso en cola.';
        this.queuedIds = ids;
        this.startPoll();
      },
      error: (err) => {
        this.procesando = false;
        this.errorGlobal = err?.error?.detail || 'No se pudo reprocesar el lote.';
      },
    });
  }

  private startPoll(): void {
    this.stopPoll();
    this.pollTimer = setInterval(() => this.refreshDocs(true), POLL_MS);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private refreshDocs(fromPoll = false): void {
    if (!this.queuedIds.length && !this.loteItems.length) return;
    this.docsApi.list({ limit: 200 }).subscribe({
      next: (res) => {
        const idSet = new Set(
          this.queuedIds.length
            ? this.queuedIds
            : this.loteItems
                .map((i) => i.document?.id)
                .filter((id): id is number => typeof id === 'number')
        );
        this.documentosLote = res.items.filter((d) => idSet.has(d.id));
        for (const d of this.documentosLote) {
          const r = this.resultados.find((x) => x.documentId === d.id);
          if (r) {
            r.estado = d.estado;
            r.ok = (d.estado || '').toUpperCase() !== 'ERROR';
            if ((d.estado || '').toUpperCase() === 'ERROR') {
              r.error = 'Error OCR/IA — revise el documento.';
            }
          }
        }
        const pending = this.kpiPendientes;
        const done = this.documentosLote.length - pending;
        if (this.documentosLote.length) {
          this.progreso = Math.min(
            99,
            35 + Math.round((done / this.documentosLote.length) * 60)
          );
          this.packActual = Math.min(
            this.packTotal,
            Math.max(1, Math.ceil(done / PACK_SIZE) || 1)
          );
        }
        if (fromPoll && pending === 0 && this.documentosLote.length) {
          this.progreso = 100;
          this.procesando = false;
          this.estado = `Lote listo: ${this.kpiOk} OK · ${this.kpiErrores} error(es) · ${this.kpiDuplicados} duplicado(s).`;
          this.stopPoll();
        }
      },
      error: () => {
        if (!fromPoll) {
          this.errorGlobal = 'No se pudo consultar el estado de los documentos del lote.';
        }
      },
    });
  }

  private limpiarPreviews(): void {
    for (const a of this.archivos) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    }
  }
}
