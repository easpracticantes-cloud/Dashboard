import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ContabilidadUserContext } from './contabilidad-user-context';

export interface CrossingSummary {
  id: number;
  document_id?: number | null;
  document_filename?: string;
  document_numero?: string;
  document_estado?: string;
  autobits_record_id?: number;
  import_batch_id?: number | null;
  match_type: string;
  match_score?: number;
  estado: string;
  proveedor?: string;
  nit?: string;
  numero_compra?: string;
  numero_reserva?: string;
  fecha_ejecucion?: string;
  concepto?: string;
  valor_documento?: number;
  valor_autobits?: number;
  diferencia?: number;
  factura_cdc?: string;
  fecha_pago?: string;
  observaciones?: string;
  match_reasons: string[];
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

export interface CrossingBatchInfo {
  id: number;
  filename: string;
  period_start?: string;
  period_end?: string;
  imported_rows: number;
  imported_at: string;
  imported_by: string;
}

export interface CrossingContext {
  has_autobits: boolean;
  batch: CrossingBatchInfo | null;
  record_total?: number;
  crossing_total?: number;
  counts: Record<string, number>;
  totals: {
    valor_pendiente_pago?: number;
    valor_pagado?: number;
  };
  workflow: { step: number; title: string; hint: string }[];
}

export interface SeedResult {
  created: number;
  updated?: number;
  changed?: number;
  archived?: number;
  skipped?: number;
  batch_id?: number;
}

@Injectable({ providedIn: 'root' })
export class CrossingsApiService {
  private readonly base = '/contabilidad/crossings';
  private readonly http = inject(HttpClient);
  private readonly userCtx = inject(ContabilidadUserContext);

  getContext(batchId?: number): Observable<CrossingContext> {
    const q = batchId ? `?batch_id=${batchId}` : '';
    return this.http.get<CrossingContext>(`${this.base}/context${q}`);
  }

  list(params?: {
    limit?: number;
    estado?: string;
    match_type?: string;
    batch_id?: number;
    proveedor?: string;
  }): Observable<{ total: number; items: CrossingSummary[] }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.estado) q.set('estado', params.estado);
    if (params?.match_type) q.set('match_type', params.match_type);
    if (params?.batch_id) q.set('batch_id', String(params.batch_id));
    if (params?.proveedor) q.set('proveedor', params.proveedor);
    const qs = q.toString();
    return this.http.get<{ total: number; items: CrossingSummary[] }>(
      `${this.base}${qs ? '?' + qs : ''}`
    );
  }

  listProveedores(): Observable<{ items: string[] }> {
    return this.http.get<{ items: string[] }>(`${this.base}/proveedores`);
  }

  seedFromAutobits(batchId?: number, useLatest = true): Observable<SeedResult> {
    return this.http.post<SeedResult>(
      `${this.base}/seed-from-autobits`,
      this.userCtx.withUsuario({
        batch_id: batchId ?? null,
        use_latest: useLatest,
      })
    );
  }

  createPaymentsFromBatch(batchId?: number): Observable<{ created: number; skipped: number; errors: string[] }> {
    return this.http.post<{ created: number; skipped: number; errors: string[] }>(
      `${this.base}/payments-from-batch`,
      this.userCtx.withUsuario({ batch_id: batchId ?? null })
    );
  }

  complete(
    id: number,
    data: { factura_cdc?: string; fecha_pago?: string; observaciones?: string }
  ): Observable<CrossingSummary> {
    return this.http.patch<CrossingSummary>(
      `${this.base}/${id}/complete`,
      this.userCtx.withUsuario({ ...data })
    );
  }

  approve(id: number): Observable<CrossingSummary> {
    return this.http.post<CrossingSummary>(
      `${this.base}/${id}/approve`,
      this.userCtx.withUsuario({})
    );
  }

  approveAllRevision(): Observable<{ approved: number }> {
    return this.http.post<{ approved: number }>(
      `${this.base}/approve-all-revision`,
      this.userCtx.withUsuario({})
    );
  }

  reject(id: number, motivo: string): Observable<CrossingSummary> {
    return this.http.post<CrossingSummary>(
      `${this.base}/${id}/reject`,
      this.userCtx.withUsuario({ motivo })
    );
  }
}
