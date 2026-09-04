import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ContabilidadUserContext } from './contabilidad-user-context';

export interface RemediationSummary {
  id: number;
  document_id: number;
  document_filename?: string;
  document_numero?: string;
  crossing_id?: number;
  proveedor?: string;
  tipo_problema: string;
  tipo_problema_label: string;
  descripcion: string;
  valor_involucrado?: number;
  responsable?: string;
  fecha_limite?: string;
  estado: string;
  observaciones?: string;
  created_at: string;
  updated_at: string;
}

export interface RemediationCatalog {
  types: { key: string; label: string }[];
  statuses: string[];
}

@Injectable({ providedIn: 'root' })
export class RemediationsApiService {
  private readonly base = '/contabilidad/remediations';
  private readonly http = inject(HttpClient);
  private readonly userCtx = inject(ContabilidadUserContext);

  catalog(): Observable<RemediationCatalog> {
    return this.http.get<RemediationCatalog>(`${this.base}/catalog`);
  }

  list(params?: {
    limit?: number;
    estado?: string;
    tipo_problema?: string;
    search?: string;
  }): Observable<{ total: number; items: RemediationSummary[] }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.estado) q.set('estado', params.estado);
    if (params?.tipo_problema) q.set('tipo_problema', params.tipo_problema);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return this.http.get<{ total: number; items: RemediationSummary[] }>(
      `${this.base}${qs ? '?' + qs : ''}`
    );
  }

  get(id: number): Observable<RemediationSummary> {
    return this.http.get<RemediationSummary>(`${this.base}/${id}`);
  }

  create(body: {
    document_id: number;
    tipo_problema: string;
    descripcion: string;
    proveedor?: string;
    valor_involucrado?: number;
    responsable?: string;
    fecha_limite?: string;
    observaciones?: string;
  }): Observable<RemediationSummary> {
    return this.http.post<RemediationSummary>(
      this.base,
      this.userCtx.withUsuario({
        ...body,
        responsable: body.responsable ?? this.userCtx.username(),
      })
    );
  }

  update(
    id: number,
    body: Partial<{
      proveedor: string;
      tipo_problema: string;
      descripcion: string;
      valor_involucrado: number;
      responsable: string;
      fecha_limite: string;
      observaciones: string;
    }>
  ): Observable<RemediationSummary> {
    return this.http.patch<RemediationSummary>(
      `${this.base}/${id}`,
      this.userCtx.withUsuario({ ...body })
    );
  }

  updateEstado(
    id: number,
    estado: string,
    observaciones?: string
  ): Observable<RemediationSummary> {
    return this.http.patch<RemediationSummary>(
      `${this.base}/${id}/estado`,
      this.userCtx.withUsuario({ estado, observaciones })
    );
  }

  delete(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
}
