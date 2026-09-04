import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AutobitsApiService,
  AutobitsBatch,
  AutobitsRecord,
  ImportResult,
} from '../../services/autobits-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import {
  formatCop,
  formatFechaContable,
  iconEstado,
  labelEstado,
  toneEstado,
} from '../../utils/contabilidad-labels';

@Component({
  selector: 'eas-contabilidad-autobits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './autobits.component.html',
  styleUrl: './autobits.component.scss',
})
export class AutobitsComponent implements OnInit {
  private readonly api = inject(AutobitsApiService);
  private readonly download = inject(ContabilidadDownloadService);

  cargando = true;
  procesando = false;
  limpiando = false;
  error = '';
  mensajeOk = '';

  batches: AutobitsBatch[] = [];
  records: AutobitsRecord[] = [];
  totalRecords = 0;
  ultimoResultado: ImportResult | null = null;

  filtroBusqueda = '';
  filtroBatchId = '';

  readonly formatCop = formatCop;
  readonly formatFechaContable = formatFechaContable;
  readonly labelEstado = labelEstado;
  readonly toneEstado = toneEstado;
  readonly iconEstado = iconEstado;

  /** KPIs derivados solo de lotes/registros ya cargados. */
  get kpiImportadas(): number {
    return this.batches.reduce((acc, b) => acc + (Number(b.imported_rows) || 0), 0);
  }

  get kpiPendientes(): number {
    const skipped = this.batches.reduce((acc, b) => acc + (Number(b.skipped_rows) || 0), 0);
    const listos = this.records.filter((r) =>
      (r.estado || '').toUpperCase().includes('LISTO')
    ).length;
    return skipped + listos;
  }

  get kpiErrores(): number {
    return this.batches.reduce((acc, b) => acc + (Number(b.error_count) || 0), 0);
  }

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.api.listBatches().subscribe({
      next: (res) => {
        this.batches = res.items;
        this.cargarRegistros();
      },
      error: () => {
        this.error = 'No se pudieron cargar los lotes Autobits.';
        this.cargando = false;
      },
    });
  }

  cargarRegistros(): void {
    this.api
      .listRecords({
        limit: 100,
        batch_id: this.filtroBatchId ? Number(this.filtroBatchId) : undefined,
        search: this.filtroBusqueda || undefined,
      })
      .subscribe({
        next: (res) => {
          this.records = res.items;
          this.totalRecords = res.total;
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar los registros.';
          this.cargando = false;
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';
    this.ultimoResultado = null;

    this.api.uploadDirect(file).subscribe({
      next: (res) => {
        this.ultimoResultado = res;
        const cruces = res.crossing?.created ?? 0;
        const modo = res.analysis_mode === 'ia' ? 'IA (Ollama)' : 'análisis básico';
        this.mensajeOk =
          `Listo (${modo}): ${res.imported_rows} fila(s) importadas` +
          (cruces ? ` · ${cruces} cruce(s) automático(s)` : '');
        this.procesando = false;
        input.value = '';
        this.cargar();
      },
      error: (err) => {
        this.error =
          err?.error?.detail ||
          'No se pudo analizar el Excel con la IA. Verifique Ollama y el archivo .xlsx.';
        this.procesando = false;
        input.value = '';
      },
    });
  }

  limpiarExcels(): void {
    const ok = window.confirm(
      '¿Limpiar todos los Excels de Autobits y Cruce ya subidos?\n\n' +
        'Se borrarán lotes, cruces y pagos derivados. Las facturas subidas se conservan.'
    );
    if (!ok) return;
    this.limpiando = true;
    this.error = '';
    this.mensajeOk = '';
    this.api.purgeExcels(true).subscribe({
      next: (res) => {
        const d = res.deleted || {};
        this.mensajeOk =
          `Excels limpiados: ${d['batches'] ?? 0} lote(s), ` +
          `${d['records'] ?? 0} fila(s), ${d['crossings'] ?? 0} cruce(s).`;
        this.limpiando = false;
        this.ultimoResultado = null;
        this.cargar();
      },
      error: (err) => {
        this.error = err?.error?.detail || 'No se pudieron limpiar los Excels.';
        this.limpiando = false;
      },
    });
  }

  verLote(batchId: number): void {
    this.filtroBatchId = String(batchId);
    this.cargarRegistros();
  }

  quitarFiltroLote(): void {
    this.filtroBatchId = '';
    this.cargarRegistros();
  }

  marcarListo(batchId: number): void {
    this.api.markBatchReady(batchId).subscribe({
      next: (res) => {
        this.mensajeOk = `${res.records_marked} registro(s) listos para actualizar Autobits.`;
        this.cargar();
      },
      error: () => {
        this.error = 'No se pudo marcar el lote.';
      },
    });
  }

  async exportarLote(batchId: number): Promise<void> {
    this.error = '';
    try {
      await this.download.download(this.api.exportBatchUrl(batchId), `autobits-lote-${batchId}.xlsx`);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo exportar el lote.';
    }
  }

  detectedMappingEntries(): [string, string][] {
    const mapping = this.ultimoResultado?.detected_mapping;
    if (!mapping) return [];
    return Object.entries(mapping);
  }
}
