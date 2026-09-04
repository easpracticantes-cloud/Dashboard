import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DashboardApiService,
  DashboardKpis,
  WeekOption,
} from '../../services/dashboard-api.service';
import { OpsAlert, OpsApiService, OpsQueueGroup, alertDetail, alertSeverity, alertTitle, extractAlerts } from '../../services/ops-api.service';
import { PeriodsApiService } from '../../services/periods-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { formatCop } from '../../utils/contabilidad-labels';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'eas-contabilidad-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(DashboardApiService);
  private readonly opsApi = inject(OpsApiService);
  private readonly periodsApi = inject(PeriodsApiService);
  private readonly download = inject(ContabilidadDownloadService);
  private readonly auth = inject(AuthService);

  kpis: DashboardKpis | null = null;
  alerts: OpsAlert[] = [];
  queueGroups: OpsQueueGroup[] = [];
  periodStatus: Record<string, unknown> | null = null;
  weeks: WeekOption[] = [];
  cargando = true;
  error = '';
  exportando = false;
  cerrandoPeriodo = false;

  filtroModo: 'semana' | 'mes' | 'anio' = 'semana';
  weekRef = '';
  mes = new Date().getMonth() + 1;
  anio = new Date().getFullYear();
  filtroProveedor = '';
  filtroEstado = '';

  readonly formatCop = formatCop;
  readonly alertSeverity = alertSeverity;
  readonly alertTitle = alertTitle;
  readonly alertDetail = alertDetail;

  /** Backend solo permite ADMIN/GERENCIA; la UI no debe ofrecer el botón a otros. */
  get puedeReabrirPeriodo(): boolean {
    return this.auth.hasAnyRole(['ADMINISTRADOR', 'GERENCIA']);
  }

  quickLinks = [
    { path: '/app/contabilidad/documentos', label: 'Documentos' },
    { path: '/app/contabilidad/cola', label: 'Cola operativa' },
    { path: '/app/contabilidad/cruce', label: 'Cruce' },
    { path: '/app/contabilidad/pagos', label: 'Pagos pendientes' },
    { path: '/app/contabilidad/subsanaciones', label: 'Subsanaciones' },
    { path: '/app/contabilidad/paquetes', label: 'Paquetes' },
  ];

  arranque = [
    {
      path: '/app/contabilidad/autobits',
      icon: 'table_chart',
      step: '01',
      label: 'Subir Excel de Autobits',
      hint: 'Reporte de la semana, sábado a viernes.',
    },
    {
      path: '/app/contabilidad/documentos',
      icon: 'description',
      step: '02',
      label: 'Cargar facturas y cuentas de cobro',
      hint: 'Las que llegaron por WhatsApp, correo o DIAN.',
    },
    {
      path: '/app/contabilidad/cruce',
      icon: 'compare_arrows',
      step: '03',
      label: 'Completar el cruce de cuentas',
      hint: 'Factura/CDC, fecha de pago y aprobación.',
    },
    {
      path: '/app/contabilidad/pagos',
      icon: 'payments',
      step: '04',
      label: 'Generar y ejecutar pagos',
      hint: 'Reporte para Bancolombia y comprobantes.',
    },
    {
      path: '/app/contabilidad/paquetes',
      icon: 'inventory_2',
      step: '05',
      label: 'Entregar paquete digital',
      hint: 'Para digitalizar en Word Office.',
    },
  ];

  get sinDatos(): boolean {
    const c = this.kpis?.conteos;
    if (!c) return false;
    return (
      c.documentos_recibidos === 0 &&
      c.documentos_procesados === 0 &&
      c.pagos_pendientes === 0 &&
      c.pagos_realizados === 0 &&
      c.subsanaciones_pendientes === 0 &&
      c.paquetes_pendientes === 0
    );
  }

  get periodoCerrado(): boolean {
    const s = this.periodStatus?.['estado'] ?? this.periodStatus?.['status'];
    return String(s).toUpperCase() === 'CERRADO';
  }

  ngOnInit(): void {
    this.api.getWeeks().subscribe({
      next: (res) => {
        this.weeks = res.weeks;
        const current = res.weeks.find((w) => w.current);
        if (current) this.weekRef = current.start;
        this.cargar();
      },
      error: () => this.cargar(),
    });
  }

  periodParams(): { week_ref?: string; mes?: number; anio?: number } {
    const params: { week_ref?: string; mes?: number; anio?: number } = {};
    if (this.filtroModo === 'semana' && this.weekRef) params.week_ref = this.weekRef;
    if (this.filtroModo === 'mes') {
      params.mes = this.mes;
      params.anio = this.anio;
    }
    if (this.filtroModo === 'anio') params.anio = this.anio;
    return params;
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    const period = this.periodParams();
    const kpiParams: Record<string, unknown> = { ...period };
    if (this.filtroProveedor) kpiParams['proveedor'] = this.filtroProveedor;
    if (this.filtroEstado) kpiParams['estado'] = this.filtroEstado;

    const weekForStatus = this.filtroModo === 'semana' ? this.weekRef : undefined;

    forkJoin({
      kpis: this.api.getKpis(kpiParams as Parameters<DashboardApiService['getKpis']>[0]).pipe(
        catchError(() => of(null))
      ),
      alerts: this.opsApi.getAlerts(period).pipe(
        catchError(() => of({ alerts: [] as OpsAlert[] }))
      ),
      queue: this.opsApi.getQueue(period).pipe(
        catchError(() => of({ groups: [] as OpsQueueGroup[] }))
      ),
      periodStatus: this.periodsApi.status(weekForStatus).pipe(
        catchError(() => of(null))
      ),
    }).subscribe({
      next: (res) => {
        if (!res.kpis) {
          this.error = 'No se pudieron cargar los KPIs.';
        } else {
          this.kpis = res.kpis;
        }
        this.alerts = extractAlerts(res.alerts);
        this.queueGroups = res.queue.groups ?? [];
        this.periodStatus = res.periodStatus;
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los indicadores.';
        this.cargando = false;
      },
    });
  }

  async exportReport(kind: 'documents' | 'payments' | 'crossings' | 'remediations' | 'semanal' | 'ops-queue'): Promise<void> {
    this.exportando = true;
    this.error = '';
    try {
      await this.download.download(this.api.reportUrl(kind, this.periodParams()));
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo exportar el reporte.';
    } finally {
      this.exportando = false;
    }
  }

  cerrarPeriodo(): void {
    if (
      !confirm(
        '¿Cerrar el periodo contable seleccionado? No podrá registrar movimientos hasta reabrirlo.'
      )
    ) {
      return;
    }
    const resumen = prompt('Resumen opcional del cierre:') || undefined;
    this.cerrandoPeriodo = true;
    this.error = '';
    const weekRef = this.filtroModo === 'semana' ? this.weekRef : undefined;
    this.periodsApi.close(weekRef, resumen).subscribe({
      next: () => {
        this.cerrandoPeriodo = false;
        this.cargar();
      },
      error: (err) => {
        this.cerrandoPeriodo = false;
        this.error = err?.error?.detail || 'No se pudo cerrar el periodo.';
      },
    });
  }

  reabrirPeriodo(): void {
    if (this.filtroModo !== 'semana' || !this.weekRef) {
      this.error = 'Seleccione una semana para reabrir el periodo.';
      return;
    }
    const motivo = prompt('Motivo de reapertura (obligatorio):');
    if (!motivo?.trim()) {
      return;
    }
    this.cerrandoPeriodo = true;
    this.error = '';
    this.periodsApi.reopen(this.weekRef, motivo.trim()).subscribe({
      next: () => {
        this.cerrandoPeriodo = false;
        this.cargar();
      },
      error: (err) => {
        this.cerrandoPeriodo = false;
        this.error = err?.error?.detail || 'No se pudo reabrir el periodo.';
      },
    });
  }

  queueLink(key: string): string | null {
    const k = key.toLowerCase();
    if (k.includes('pago') || k.includes('payment')) return '/app/contabilidad/pagos';
    if (k.includes('cruce') || k.includes('cross')) return '/app/contabilidad/cruce';
    if (k.includes('document') || k.includes('factura')) return '/app/contabilidad/documentos';
    if (k.includes('paquete') || k.includes('package')) return '/app/contabilidad/paquetes';
    if (k.includes('subsan') || k.includes('remediation')) return '/app/contabilidad/subsanaciones';
    if (k.includes('autobits')) return '/app/contabilidad/autobits';
    return null;
  }

  alertSeverityClass(severity: string): string {
    const s = (severity || '').toLowerCase();
    if (['critical', 'critica', 'crítica', 'error', 'high', 'alta'].includes(s)) return 'bad';
    if (['warning', 'warn', 'medium', 'media', 'media'].includes(s)) return 'warn';
    if (['info', 'low', 'baja', 'informativa'].includes(s)) return 'info';
    return 'muted';
  }

  alertIcon(severity: string): string {
    const s = (severity || '').toLowerCase();
    if (['critical', 'critica', 'crítica', 'error', 'high', 'alta'].includes(s)) return 'error';
    if (['warning', 'warn', 'medium', 'media'].includes(s)) return 'warning';
    if (['info', 'low', 'baja', 'informativa'].includes(s)) return 'info';
    return 'notifications';
  }
}
