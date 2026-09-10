import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  CruceBatchInfo,
  CruceExcelApiService,
  CruceUploadResult,
  PendienteItem,
  PendientesData,
} from '../../services/cruce-excel-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { formatCop } from '../../utils/contabilidad-labels';

const ICONOS: Record<string, string> = {
  SIN_FACTURA: 'receipt_long',
  SIN_FECHA_PAGO: 'event_busy',
  SIN_SOPORTE: 'attach_file_off',
  DIFERENCIA_VALOR: 'balance',
  FALTA_EN_CRUCE: 'playlist_add',
  SOBRA_EN_CRUCE: 'help_outline',
  AMBIGUO: 'priority_high',
  DUPLICADO: 'content_copy',
};

@Component({
  selector: 'eas-contabilidad-pending',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './pending.component.html',
  styleUrl: './pending.component.scss',
})
export class PendingComponent implements OnInit {
  private readonly api = inject(CruceExcelApiService);
  private readonly download = inject(ContabilidadDownloadService);

  cargando = true;
  subiendo = false;
  generando = false;
  error = '';
  mensajeOk = '';

  hasAutobits = false;
  batch: CruceBatchInfo | null = null;
  pendientes: PendientesData | null = null;
  ultimaCarga: CruceUploadResult | null = null;

  tipoActivo = '';

  readonly formatCop = formatCop;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.api.getPendientes().subscribe({
      next: (res) => {
        this.hasAutobits = res.has_autobits;
        this.batch = res.batch;
        this.pendientes = res.pendientes;
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los pendientes.';
        this.cargando = false;
      },
    });
  }

  analizar(): void {
    this.subiendo = true;
    this.error = '';
    this.mensajeOk = '';
    this.api.analizar(this.batch?.id).subscribe({
      next: (res) => {
        this.subiendo = false;
        this.ultimaCarga = res;
        this.pendientes = res.pendientes;
        this.batch = res.batch;
        this.hasAutobits = !!res.batch;
        this.tipoActivo = '';
        this.mensajeOk = `Cruce analizado desde SIG: ${res.lectura.filas_leidas} filas · ${res.pendientes.total} pendiente(s).`;
      },
      error: (err) => {
        this.subiendo = false;
        this.error =
          err?.error?.detail ||
          'No se pudo analizar el cruce con los datos de SIG.';
      },
    });
  }

  async generarExcel(): Promise<void> {
    this.generando = true;
    this.error = '';
    try {
      const today = new Date().toISOString().slice(0, 10);
      await this.download.download(
        this.api.exportExcelUrl(this.batch?.id),
        `Cruce_Cuentas_${today}.xlsx`,
      );
      this.mensajeOk = 'Excel de Cruce de Cuentas descargado.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo generar el Excel.';
    } finally {
      this.generando = false;
    }
  }

  get tipos(): { tipo: string; etiqueta: string; cantidad: number; icono: string }[] {
    return (this.pendientes?.resumen ?? []).map((r) => ({
      ...r,
      icono: ICONOS[r.tipo] || 'error_outline',
    }));
  }

  get itemsVisibles(): { tipo: string; etiqueta: string; icono: string; items: PendienteItem[] }[] {
    const porTipo = this.pendientes?.por_tipo ?? {};
    return this.tipos
      .filter((t) => !this.tipoActivo || t.tipo === this.tipoActivo)
      .map((t) => ({
        tipo: t.tipo,
        etiqueta: t.etiqueta,
        icono: t.icono,
        items: porTipo[t.tipo] ?? [],
      }));
  }

  filtrar(tipo: string): void {
    this.tipoActivo = this.tipoActivo === tipo ? '' : tipo;
  }

  /** Prioridad visual únicamente (no cambia reglas de negocio). */
  tipoTone(tipo: string): 'bad' | 'warn' | 'info' | 'muted' {
    const t = (tipo || '').toUpperCase();
    if (t === 'SIN_FACTURA' || t === 'DIFERENCIA_VALOR' || t === 'FALTA_EN_CRUCE') return 'bad';
    if (t === 'SIN_FECHA_PAGO' || t === 'SIN_SOPORTE') return 'warn';
    if (t === 'SOBRA_EN_CRUCE') return 'info';
    return 'muted';
  }

  tipoPriorityLabel(tipo: string): string {
    const t = (tipo || '').toUpperCase();
    if (t === 'AMBIGUO') return 'Ambiguo';
    if (t === 'DUPLICADO') return 'Duplicado';
    if (t === 'FALTA_EN_CRUCE') return 'Sin soporte Autobits';
    const tone = this.tipoTone(tipo);
    if (tone === 'bad') return 'Urgente';
    if (tone === 'warn') return 'Pendiente';
    if (tone === 'info') return 'Revisar';
    return 'Info';
  }

  accionPendienteLabel(tipo: string): string {
    if (tipo === 'FALTA_EN_CRUCE') return 'Revisar en SIG';
    if (tipo === 'SOBRA_EN_CRUCE') return 'Revisar en Autobits';
    return 'Completar en cruce';
  }

  async exportar(): Promise<void> {
    this.error = '';
    try {
      await this.download.download(this.api.exportUrl(this.batch?.id), 'pendientes-cruce.csv');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo exportar.';
    }
  }

  periodoLabel(): string {
    if (!this.batch?.period_start) return '';
    return `${this.batch.period_start} → ${this.batch.period_end || '?'}`;
  }
}
