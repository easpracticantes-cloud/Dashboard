import { Component, OnInit } from '@angular/core';
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

const ICONOS: Record<string, string> = {
  SIN_FACTURA: 'receipt_long',
  SIN_FECHA_PAGO: 'event_busy',
  SIN_SOPORTE: 'attach_file_off',
  DIFERENCIA_VALOR: 'balance',
  FALTA_EN_CRUCE: 'playlist_add',
  SOBRA_EN_CRUCE: 'help_outline',
};

@Component({
  selector: 'eas-contabilidad-pending',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './pending.component.html',
  styleUrl: './pending.component.scss',
})
export class PendingComponent implements OnInit {
  cargando = true;
  subiendo = false;
  error = '';
  mensajeOk = '';

  hasAutobits = false;
  batch: CruceBatchInfo | null = null;
  pendientes: PendientesData | null = null;
  ultimaCarga: CruceUploadResult | null = null;

  tipoActivo = '';

  constructor(private readonly api: CruceExcelApiService) {}

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

  onFileSelected(event: Event, aplicar: boolean): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.subiendo = true;
    this.error = '';
    this.mensajeOk = '';
    this.ultimaCarga = null;

    this.api.upload(file, aplicar).subscribe({
      next: (res) => {
        this.subiendo = false;
        input.value = '';
        this.ultimaCarga = res;
        this.pendientes = res.pendientes;
        this.batch = res.batch;
        this.hasAutobits = true;
        this.tipoActivo = '';
        this.mensajeOk = res.aplicado
          ? `Cruce aplicado: ${res.conciliacion.actualizadas} fila(s) actualizadas de ${res.lectura.filas_leidas} leídas.`
          : `Revisión sin cambios: ${res.conciliacion.emparejadas} fila(s) coinciden de ${res.lectura.filas_leidas} leídas.`;
      },
      error: (err) => {
        this.subiendo = false;
        input.value = '';
        this.error =
          err?.error?.detail ||
          'No se pudo leer el Excel de cruce de cuentas. Guárdelo como .xlsx e intente de nuevo.';
      },
    });
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

  exportar(): void {
    window.open(this.api.exportUrl(this.batch?.id), '_blank');
  }

  periodoLabel(): string {
    if (!this.batch?.period_start) return '';
    return `${this.batch.period_start} → ${this.batch.period_end || '?'}`;
  }
}
