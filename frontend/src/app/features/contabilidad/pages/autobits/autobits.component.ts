import { Component, OnInit } from '@angular/core';
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
  cargando = true;
  procesando = false;
  error = '';
  mensajeOk = '';

  batches: AutobitsBatch[] = [];
  records: AutobitsRecord[] = [];
  totalRecords = 0;
  ultimoResultado: ImportResult | null = null;

  filtroBusqueda = '';
  filtroBatchId = '';

  constructor(private readonly api: AutobitsApiService) {}

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

  exportarLote(batchId: number): void {
    window.open(this.api.exportBatchUrl(batchId), '_blank');
  }

  detectedMappingEntries(): [string, string][] {
    const mapping = this.ultimoResultado?.detected_mapping;
    if (!mapping) return [];
    return Object.entries(mapping);
  }
}
