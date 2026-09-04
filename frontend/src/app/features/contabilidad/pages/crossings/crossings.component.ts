import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  CrossingContext,
  CrossingSummary,
  CrossingsApiService,
} from '../../services/crossings-api.service';
import {
  CruceExcelApiService,
  CruceUploadResult,
  PendienteItem,
  PendientesData,
} from '../../services/cruce-excel-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { formatCop } from '../../utils/contabilidad-labels';

const ICONOS_PENDIENTE: Record<string, string> = {
  SIN_FACTURA: 'receipt_long',
  SIN_FECHA_PAGO: 'event_busy',
  SIN_SOPORTE: 'attach_file_off',
  DIFERENCIA_VALOR: 'balance',
  FALTA_EN_CRUCE: 'playlist_add',
  SOBRA_EN_CRUCE: 'help_outline',
};

@Component({
  selector: 'eas-contabilidad-crossings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './crossings.component.html',
  styleUrl: './crossings.component.scss',
})
export class CrossingsComponent implements OnInit {
  private readonly api = inject(CrossingsApiService);
  private readonly cruceExcel = inject(CruceExcelApiService);
  private readonly download = inject(ContabilidadDownloadService);

  cruces: CrossingSummary[] = [];
  total = 0;
  context: CrossingContext | null = null;
  cargando = true;
  ejecutando = false;
  subiendoCruce = false;
  error = '';
  mensajeOk = '';

  pendientes: PendientesData | null = null;
  ultimaCargaCruce: CruceUploadResult | null = null;
  tipoPendienteActivo = '';
  verSoloPendientes = false;

  filtroEstado = '';
  filtroProveedor = '';
  proveedores: string[] = [];
  verArchivados = false;

  estados = ['', 'PENDIENTE', 'APROBADO', 'PAGADO', 'EN_REVISION', 'SUBSANACION'];

  editId: number | null = null;
  editFactura = '';
  editFechaPago = '';

  readonly formatCop = formatCop;

  ngOnInit(): void {
    this.cargarContexto();
    this.api.listProveedores().subscribe({
      next: (res) => (this.proveedores = res.items),
    });
  }

  get batchId(): number | undefined {
    return this.context?.batch?.id;
  }

  get grupos(): { proveedor: string; items: CrossingSummary[] }[] {
    const filas = this.verSoloPendientes ? this.crucesFiltradas : this.cruces;
    const map = new Map<string, CrossingSummary[]>();
    for (const c of filas) {
      const key = c.proveedor || '(Sin proveedor)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).map(([proveedor, items]) => ({ proveedor, items }));
  }

  get crucesFiltradas(): CrossingSummary[] {
    if (!this.verSoloPendientes || !this.pendientes) return this.cruces;
    const ids = new Set<number>();
    for (const items of Object.values(this.pendientes.por_tipo)) {
      for (const p of items) {
        if (p.crossing_id) ids.add(p.crossing_id);
      }
    }
    return this.cruces.filter((c) => ids.has(c.id));
  }

  get resumenPendientes(): { tipo: string; etiqueta: string; cantidad: number; icono: string }[] {
    return (this.pendientes?.resumen ?? []).map((r) => ({
      ...r,
      icono: ICONOS_PENDIENTE[r.tipo] || 'error_outline',
    }));
  }

  get pendientesVisibles(): { tipo: string; etiqueta: string; icono: string; items: PendienteItem[] }[] {
    const porTipo = this.pendientes?.por_tipo ?? {};
    return this.resumenPendientes
      .filter((t) => !this.tipoPendienteActivo || t.tipo === this.tipoPendienteActivo)
      .map((t) => ({
        tipo: t.tipo,
        etiqueta: t.etiqueta,
        icono: t.icono,
        items: porTipo[t.tipo] ?? [],
      }));
  }

  get resumenEstados(): { label: string; val: number; cls: string }[] {
    const c = this.context?.counts || {};
    return [
      { label: 'Pendientes', val: c['PENDIENTE'] || 0, cls: 'muted' },
      { label: 'Aprobados', val: c['APROBADO'] || 0, cls: 'ok' },
      { label: 'Pagados', val: c['PAGADO'] || 0, cls: 'paid' },
      { label: 'Subsanar', val: c['SUBSANACION'] || 0, cls: 'warn' },
    ];
  }

  cargarContexto(): void {
    this.cargando = true;
    this.error = '';
    this.api.getContext().subscribe({
      next: (ctx) => {
        this.context = ctx;
        this.cargarPendientes();
        this.cargar();
      },
      error: () => {
        this.context = null;
        this.cargando = false;
        this.error = 'No se pudo cargar el contexto del cruce.';
      },
    });
  }

  cargarPendientes(): void {
    if (!this.context?.has_autobits) {
      this.pendientes = null;
      return;
    }
    this.cruceExcel.getPendientes(this.batchId).subscribe({
      next: (res) => (this.pendientes = res.pendientes),
      error: () => (this.pendientes = null),
    });
  }

  cargar(): void {
    if (!this.context?.has_autobits) {
      this.cruces = [];
      this.total = 0;
      this.cargando = false;
      return;
    }

    this.api
      .list({
        limit: 500,
        batch_id: this.batchId,
        estado: this.filtroEstado || undefined,
        proveedor: this.filtroProveedor || undefined,
      })
      .subscribe({
        next: (res) => {
          this.cruces = res.items.filter(
            (c) => this.verArchivados || c.estado !== 'ARCHIVADO'
          );
          this.total = res.total;
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar los cruces.';
          this.cargando = false;
        },
      });
  }

  onCruceExcelSelected(event: Event, aplicar = true): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.subiendoCruce = true;
    this.error = '';
    this.mensajeOk = '';
    this.ultimaCargaCruce = null;

    this.cruceExcel.upload(file, aplicar).subscribe({
      next: (res) => {
        this.subiendoCruce = false;
        input.value = '';
        this.ultimaCargaCruce = res;
        this.pendientes = res.pendientes;
        this.tipoPendienteActivo = '';
        const c = res.conciliacion;
        const faltan = res.pendientes?.por_tipo?.['FALTA_EN_CRUCE']?.length || 0;
        const base = res.aplicado
          ? `Cruce aplicado: ${c.emparejadas} coinciden con Autobits · ${c.actualizadas} actualizada(s)`
          : `Revisión: ${c.emparejadas} coinciden con Autobits (sin modificar)`;
        this.mensajeOk =
          faltan > 0
            ? `${base}. ${faltan} fila(s) de Autobits faltan en su Excel — diligéncielas abajo.`
            : `${base}. Pendientes por campos: ${res.pendientes.total}.`;
        if (faltan > 0) {
          this.tipoPendienteActivo = 'FALTA_EN_CRUCE';
          this.verSoloPendientes = true;
        }
        // Recarga contexto/filas; GET /pendientes ya trae FALTA_EN_CRUCE del snapshot.
        this.cargarContexto();
      },
      error: (err) => {
        this.subiendoCruce = false;
        input.value = '';
        this.error =
          err?.error?.detail ||
          'No se pudo leer el Excel de cruce de cuentas. Guárdelo como .xlsx e intente de nuevo.';
      },
    });
  }

  accionPendienteLabel(tipo: string): string {
    if (tipo === 'FALTA_EN_CRUCE') return 'Agregar al Excel de cruce';
    if (tipo === 'SOBRA_EN_CRUCE') return 'Revisar en Autobits';
    if (tipo === 'SIN_FACTURA' || tipo === 'SIN_FECHA_PAGO') return 'Completar';
    return 'Ver';
  }

  puedeCompletarPendiente(tipo: string, crossingId?: number | null): boolean {
    return !!crossingId && (tipo === 'SIN_FACTURA' || tipo === 'SIN_FECHA_PAGO' || tipo === 'DIFERENCIA_VALOR');
  }

  filtrarPendiente(tipo: string): void {
    this.tipoPendienteActivo = this.tipoPendienteActivo === tipo ? '' : tipo;
  }

  async exportarPendientes(): Promise<void> {
    this.error = '';
    try {
      await this.download.download(this.cruceExcel.exportUrl(this.batchId), 'cruce-pendientes.csv');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo exportar pendientes.';
    }
  }

  toggleSoloPendientes(): void {
    this.verSoloPendientes = !this.verSoloPendientes;
  }

  sincronizarDesdeUltimoExcel(): void {
    this.ejecutando = true;
    this.error = '';
    this.mensajeOk = '';
    this.api.seedFromAutobits(this.batchId, true).subscribe({
      next: (res) => {
        this.ejecutando = false;
        const parts = [`${res.created} nueva(s)`];
        if (res.updated) {
          parts.push(
            res.changed
              ? `${res.updated} conservada(s) (${res.changed} con cambios)`
              : `${res.updated} conservada(s)`
          );
        }
        if (res.archived) parts.push(`${res.archived} archivada(s)`);
        this.mensajeOk = `Cruce sincronizado con el último Excel: ${parts.join(' · ')}`;
        this.cargarContexto();
      },
      error: (err) => {
        this.ejecutando = false;
        this.error =
          err?.error?.detail ||
          'Suba primero el Excel de Autobits (semana sábado–viernes).';
      },
    });
  }

  generarPagos(): void {
    this.ejecutando = true;
    this.error = '';
    this.mensajeOk = '';
    this.api.createPaymentsFromBatch(this.batchId).subscribe({
      next: (res) => {
        this.ejecutando = false;
        this.mensajeOk = `Reporte de pagos: ${res.created} creado(s)` +
          (res.skipped ? ` · ${res.skipped} ya existían` : '');
        if (res.errors?.length) {
          this.error = res.errors.slice(0, 3).join(' · ');
        }
        this.cargarContexto();
      },
      error: (err) => {
        this.ejecutando = false;
        this.error = err?.error?.detail || 'No se pudieron generar los pagos.';
      },
    });
  }

  empezarEdicion(c: CrossingSummary): void {
    this.editId = c.id;
    this.editFactura = c.factura_cdc || '';
    this.editFechaPago = c.fecha_pago || '';
  }

  empezarEdicionPorId(crossingId: number): void {
    const fila = this.cruces.find((c) => c.id === crossingId);
    if (fila) this.empezarEdicion(fila);
  }

  cancelarEdicion(): void {
    this.editId = null;
    this.editFactura = '';
    this.editFechaPago = '';
  }

  guardar(c: CrossingSummary): void {
    this.api
      .complete(c.id, {
        factura_cdc: this.editFactura,
        fecha_pago: this.editFechaPago,
      })
      .subscribe({
        next: () => {
          this.cancelarEdicion();
          this.cargarContexto();
        },
        error: () => {
          this.error = 'No se pudo guardar el cruce.';
        },
      });
  }

  puedeAprobar(c: CrossingSummary): boolean {
    return c.estado === 'PENDIENTE' || c.estado === 'EN_REVISION';
  }

  puedeRechazar(c: CrossingSummary): boolean {
    return c.estado !== 'PAGADO' && c.estado !== 'ARCHIVADO' && c.estado !== 'SUBSANACION';
  }

  aprobarCruce(c: CrossingSummary): void {
    if (!this.puedeAprobar(c)) return;
    if (!confirm(`¿Aprobar el cruce #${c.id} de ${c.proveedor || 'proveedor'}?`)) return;
    this.error = '';
    this.ejecutando = true;
    this.api.approve(c.id).subscribe({
      next: () => {
        this.ejecutando = false;
        this.mensajeOk = `Cruce #${c.id} aprobado.`;
        this.cargarContexto();
      },
      error: (err) => {
        this.ejecutando = false;
        this.error = err?.error?.detail || 'No se pudo aprobar el cruce.';
      },
    });
  }

  rechazarCruce(c: CrossingSummary): void {
    if (!this.puedeRechazar(c)) return;
    const motivo = (prompt('Motivo del rechazo / envío a subsanación:') || '').trim();
    if (!motivo) {
      this.error = 'Debe indicar el motivo del rechazo.';
      return;
    }
    this.error = '';
    this.ejecutando = true;
    this.api.reject(c.id, motivo).subscribe({
      next: () => {
        this.ejecutando = false;
        this.mensajeOk = `Cruce #${c.id} enviado a subsanación.`;
        this.cargarContexto();
      },
      error: (err) => {
        this.ejecutando = false;
        this.error = err?.error?.detail || 'No se pudo rechazar el cruce.';
      },
    });
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      APROBADO: 'ok',
      EN_REVISION: 'warn',
      SUBSANACION: 'bad',
      PENDIENTE: 'muted',
      PAGADO: 'paid',
      ARCHIVADO: 'archived',
    };
    return map[estado] || 'muted';
  }

  periodoLabel(): string {
    const b = this.context?.batch;
    if (!b?.period_start || !b?.period_end) return '';
    return `${b.period_start} → ${b.period_end}`;
  }
}
