import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WeekOption {
  start: string;
  end: string;
  label: string;
  current: boolean;
}

export interface DashboardKpis {
  periodo: { inicio: string; fin: string; etiqueta: string };
  conteos: {
    documentos_recibidos: number;
    documentos_procesados: number;
    pendientes_revision: number;
    aprobados: number;
    subsanaciones_pendientes: number;
    pagos_pendientes: number;
    pagos_realizados: number;
    paquetes_pendientes: number;
    cruces_aprobados: number;
  };
  totales: {
    valor_documentos: number;
    valor_aprobado: number;
    valor_pendiente_pago: number;
    valor_pagado: number;
    valor_por_subsanar: number;
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  constructor(private readonly http: HttpClient) {}

  getWeeks(): Observable<{ weeks: WeekOption[] }> {
    return this.http.get<{ weeks: WeekOption[] }>('/api/dashboard/weeks');
  }

  getKpis(params?: {
    week_ref?: string;
    period_start?: string;
    period_end?: string;
    mes?: number;
    anio?: number;
    proveedor?: string;
    estado?: string;
    tipo?: string;
  }): Observable<DashboardKpis> {
    const q = new URLSearchParams();
    if (params?.week_ref) q.set('week_ref', params.week_ref);
    if (params?.period_start) q.set('period_start', params.period_start);
    if (params?.period_end) q.set('period_end', params.period_end);
    if (params?.mes) q.set('mes', String(params.mes));
    if (params?.anio) q.set('anio', String(params.anio));
    if (params?.proveedor) q.set('proveedor', params.proveedor);
    if (params?.estado) q.set('estado', params.estado);
    if (params?.tipo) q.set('tipo', params.tipo);
    const qs = q.toString();
    return this.http.get<DashboardKpis>(`/api/dashboard/kpis${qs ? '?' + qs : ''}`);
  }

  reportUrl(kind: 'documents' | 'payments' | 'crossings' | 'remediations' | 'semanal' | 'ops-queue', params?: {
    week_ref?: string;
    mes?: number;
    anio?: number;
  }): string {
    const q = new URLSearchParams();
    if (params?.week_ref) q.set('week_ref', params.week_ref);
    if (params?.mes) q.set('mes', String(params.mes));
    if (params?.anio) q.set('anio', String(params.anio));
    const qs = q.toString();
    if (kind === 'semanal') {
      return `/api/reports/semanal.html${qs ? '?' + qs : ''}`;
    }
    if (kind === 'ops-queue') {
      return `/api/reports/ops-queue.csv${qs ? '?' + qs : ''}`;
    }
    return `/api/reports/${kind}.csv${qs ? '?' + qs : ''}`;
  }
}
