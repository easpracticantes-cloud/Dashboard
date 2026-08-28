import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  DashboardApiService,
  DashboardKpis,
  WeekOption,
} from '../../services/dashboard-api.service';

@Component({
  selector: 'eas-contabilidad-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  kpis: DashboardKpis | null = null;
  weeks: WeekOption[] = [];
  cargando = true;
  error = '';

  filtroModo: 'semana' | 'mes' | 'anio' = 'semana';
  weekRef = '';
  mes = new Date().getMonth() + 1;
  anio = new Date().getFullYear();
  filtroProveedor = '';
  filtroEstado = '';

  quickLinks = [
    { path: '/app/contabilidad/documentos', label: 'Documentos' },
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

  constructor(private readonly api: DashboardApiService) {}

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

  cargar(): void {
    this.cargando = true;
    this.error = '';
    const params: Record<string, unknown> = {};
    if (this.filtroModo === 'semana' && this.weekRef) params['week_ref'] = this.weekRef;
    if (this.filtroModo === 'mes') {
      params['mes'] = this.mes;
      params['anio'] = this.anio;
    }
    if (this.filtroModo === 'anio') params['anio'] = this.anio;
    if (this.filtroProveedor) params['proveedor'] = this.filtroProveedor;
    if (this.filtroEstado) params['estado'] = this.filtroEstado;

    this.api.getKpis(params as Parameters<DashboardApiService['getKpis']>[0]).subscribe({
      next: (data) => {
        this.kpis = data;
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los KPIs.';
        this.cargando = false;
      },
    });
  }

  exportReport(kind: 'documents' | 'payments' | 'crossings' | 'remediations' | 'semanal'): void {
    const params: { week_ref?: string; mes?: number; anio?: number } = {};
    if (this.filtroModo === 'semana' && this.weekRef) params.week_ref = this.weekRef;
    if (this.filtroModo === 'mes') {
      params.mes = this.mes;
      params.anio = this.anio;
    }
    if (this.filtroModo === 'anio') params.anio = this.anio;
    window.open(this.api.reportUrl(kind, params), '_blank');
  }
}
