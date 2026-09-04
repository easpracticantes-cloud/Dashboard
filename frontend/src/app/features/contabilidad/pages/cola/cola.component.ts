import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DashboardApiService,
  WeekOption,
} from '../../services/dashboard-api.service';
import { OpsAlert, OpsApiService, OpsQueueGroup, alertDetail, alertSeverity, alertTitle, extractAlerts } from '../../services/ops-api.service';

@Component({
  selector: 'eas-contabilidad-cola',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './cola.component.html',
  styleUrl: './cola.component.scss',
})
export class ColaComponent implements OnInit {
  private readonly opsApi = inject(OpsApiService);
  private readonly dashboardApi = inject(DashboardApiService);

  alerts: OpsAlert[] = [];
  queueGroups: OpsQueueGroup[] = [];
  weeks: WeekOption[] = [];
  cargando = true;
  error = '';

  readonly alertSeverity = alertSeverity;
  readonly alertTitle = alertTitle;
  readonly alertDetail = alertDetail;

  filtroModo: 'semana' | 'mes' | 'anio' = 'semana';
  weekRef = '';
  mes = new Date().getMonth() + 1;
  anio = new Date().getFullYear();

  ngOnInit(): void {
    this.dashboardApi.getWeeks().subscribe({
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

    forkJoin({
      alerts: this.opsApi.getAlerts(period).pipe(
        catchError(() => of({ alerts: [] as OpsAlert[] }))
      ),
      queue: this.opsApi.getQueue(period).pipe(
        catchError(() => of({ groups: [] as OpsQueueGroup[] }))
      ),
    }).subscribe({
      next: (res) => {
        this.alerts = extractAlerts(res.alerts);
        this.queueGroups = res.queue.groups ?? [];
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la cola operativa.';
        this.cargando = false;
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
    if (['warning', 'warn', 'medium', 'media'].includes(s)) return 'warn';
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

  get urgentes(): number {
    return this.alerts.filter((a) => {
      const s = alertSeverity(a).toLowerCase();
      return s === 'critical' || s === 'error' || s === 'high' || s === 'critica' || s === 'alta';
    }).length;
  }

  get totalCola(): number {
    return this.queueGroups.reduce((acc, g) => acc + (Number(g.count) || 0), 0);
  }

  groupTone(g: OpsQueueGroup): string {
    const k = (g.key || g.label || '').toLowerCase();
    if (k.includes('urg') || k.includes('venc') || k.includes('alert')) return 'bad';
    if (k.includes('complet') || k.includes('pagado') || k.includes('ok')) return 'ok';
    return 'warn';
  }

  groupToneLabel(g: OpsQueueGroup): string {
    const tone = this.groupTone(g);
    if (tone === 'bad') return 'Urgente';
    if (tone === 'ok') return 'Avanzado';
    return 'Pendiente';
  }
}
