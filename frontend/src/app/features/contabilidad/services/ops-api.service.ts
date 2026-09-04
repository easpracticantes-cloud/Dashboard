import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Alerta operativa (acepta claves EN/ES del backend). */
export interface OpsAlert {
  code?: string;
  codigo?: string;
  severity?: string;
  severidad?: string;
  title?: string;
  titulo?: string;
  detail?: string;
  accion_sugerida?: string;
  entity_type?: string;
  entity_id?: number | string;
  document_id?: number;
  cantidad?: number;
}

export interface OpsQueueGroup {
  key: string;
  label: string;
  count: number;
  items?: Record<string, unknown>[];
}

export interface OpsQueueResponse {
  groups: OpsQueueGroup[];
  items?: Record<string, unknown[]> | OpsQueueGroup[];
  conteos?: Record<string, number>;
  total_pendientes?: number;
  periodo?: unknown;
  totales?: Record<string, number>;
}

export interface OpsChain {
  document: Record<string, unknown> | null;
  autobits: Record<string, unknown> | null;
  crossing: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  receipt: boolean;
  receipts?: Record<string, unknown>[];
  package?: Record<string, unknown> | null;
  missing_links: string[];
  status: 'COMPLETA' | 'INCOMPLETA' | string;
}

const QUEUE_LABELS: Record<string, string> = {
  pagos_sin_confirmacion_bancaria: 'Pagos sin confirmación bancaria',
  cruces_incompletos: 'Cruces incompletos',
  documentos_duplicados: 'Documentos duplicados',
  subsanaciones_abiertas: 'Subsanaciones abiertas',
  comprobantes_faltantes: 'Comprobantes faltantes',
};

@Injectable({ providedIn: 'root' })
export class OpsApiService {
  private readonly http = inject(HttpClient);

  private periodParams(p?: {
    week_ref?: string;
    mes?: number;
    anio?: number;
  }): HttpParams {
    let params = new HttpParams();
    if (p?.week_ref) params = params.set('week_ref', p.week_ref);
    if (p?.mes) params = params.set('mes', String(p.mes));
    if (p?.anio) params = params.set('anio', String(p.anio));
    return params;
  }

  getQueue(period?: {
    week_ref?: string;
    mes?: number;
    anio?: number;
  }): Observable<OpsQueueResponse> {
    return this.http
      .get<Record<string, unknown>>('/contabilidad/ops/queue', {
        params: this.periodParams(period),
      })
      .pipe(map((raw) => normalizeQueueResponse(raw)));
  }

  getAlerts(period?: {
    week_ref?: string;
    mes?: number;
    anio?: number;
  }): Observable<{ alerts?: OpsAlert[]; alertas?: OpsAlert[]; periodo?: unknown }> {
    return this.http.get<{ alerts?: OpsAlert[]; alertas?: OpsAlert[] }>('/contabilidad/ops/alerts', {
      params: this.periodParams(period),
    });
  }

  getChain(documentId: number): Observable<OpsChain> {
    return this.http.get<OpsChain>(`/contabilidad/ops/chain/${documentId}`);
  }
}

/** Normaliza items/conteos del backend a groups[] para la UI. */
export function normalizeQueueResponse(raw: Record<string, unknown> | null | undefined): OpsQueueResponse {
  if (!raw) return { groups: [] };

  const existing = raw['groups'];
  if (Array.isArray(existing) && existing.length && typeof existing[0] === 'object' && 'count' in (existing[0] as object)) {
    return {
      groups: existing as OpsQueueGroup[],
      periodo: raw['periodo'],
      totales: raw['totales'] as Record<string, number> | undefined,
      total_pendientes: Number(raw['total_pendientes'] ?? 0),
    };
  }

  const conteos = (raw['conteos'] as Record<string, number> | undefined) || {};
  const itemsMap = raw['items'];
  const groups: OpsQueueGroup[] = [];

  if (conteos && typeof conteos === 'object' && !Array.isArray(conteos)) {
    for (const [key, count] of Object.entries(conteos)) {
      const bucket =
        itemsMap && typeof itemsMap === 'object' && !Array.isArray(itemsMap)
          ? ((itemsMap as Record<string, unknown[]>)[key] ?? [])
          : [];
      groups.push({
        key,
        label: QUEUE_LABELS[key] || humanizeKey(key),
        count: Number(count) || 0,
        items: Array.isArray(bucket) ? (bucket as Record<string, unknown>[]) : [],
      });
    }
  } else if (Array.isArray(itemsMap)) {
    for (const g of itemsMap as OpsQueueGroup[]) {
      groups.push({
        key: g.key,
        label: g.label || humanizeKey(g.key),
        count: Number(g.count) || 0,
        items: g.items,
      });
    }
  }

  return {
    groups,
    items: itemsMap as Record<string, unknown[]> | OpsQueueGroup[] | undefined,
    conteos,
    periodo: raw['periodo'],
    totales: raw['totales'] as Record<string, number> | undefined,
    total_pendientes:
      Number(raw['total_pendientes'] ?? groups.reduce((a, g) => a + g.count, 0)),
  };
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Helpers visuales sin transformar la API. */
export function extractAlerts(
  res: { alerts?: OpsAlert[]; alertas?: OpsAlert[] } | null | undefined
): OpsAlert[] {
  if (!res) return [];
  return res.alerts ?? res.alertas ?? [];
}

export function alertSeverity(a: OpsAlert): string {
  return a.severity || a.severidad || '';
}

export function alertTitle(a: OpsAlert): string {
  return a.title || a.titulo || a.code || a.codigo || 'Alerta';
}

export function alertDetail(a: OpsAlert): string {
  return a.detail || a.accion_sugerida || '';
}
