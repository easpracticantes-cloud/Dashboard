import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DigitalPackage {
  id: number;
  document_id: number;
  document_filename?: string;
  document_numero?: string;
  proveedor?: string;
  crossing_id?: number;
  payment_id?: number;
  estado: string;
  responsable: string;
  observaciones?: string;
  has_zip: boolean;
  download_url?: string;
  period_start?: string;
  period_end?: string;
  generated_at?: string;
  delivered_at?: string;
  created_at: string;
}

export interface StorageStatus {
  active_provider: string;
  local: { provider: string; root: string; structure: string };
  google_drive: { provider: string; enabled: boolean; configured: boolean; message: string };
}

@Injectable({ providedIn: 'root' })
export class PackagesApiService {
  private readonly base = '/contabilidad/packages';

  constructor(private readonly http: HttpClient) {}

  storageStatus(): Observable<StorageStatus> {
    return this.http.get<StorageStatus>(`${this.base}/storage/status`);
  }

  list(params?: {
    limit?: number;
    estado?: string;
    search?: string;
  }): Observable<{ total: number; items: DigitalPackage[] }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.estado) q.set('estado', params.estado);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return this.http.get<{ total: number; items: DigitalPackage[] }>(
      `${this.base}${qs ? '?' + qs : ''}`
    );
  }

  create(body: {
    document_id: number;
    observaciones?: string;
    responsable?: string;
  }): Observable<DigitalPackage> {
    return this.http.post<DigitalPackage>(this.base, {
      usuario: 'ANDREA',
      responsable: 'KATHERINE',
      ...body,
    });
  }

  generate(id: number): Observable<DigitalPackage> {
    return this.http.post<DigitalPackage>(`${this.base}/${id}/generate`, {});
  }

  updateEstado(id: number, estado: string, observaciones?: string): Observable<DigitalPackage> {
    return this.http.patch<DigitalPackage>(`${this.base}/${id}/estado`, {
      estado,
      observaciones,
      usuario: 'ANDREA',
    });
  }

  downloadUrl(id: number): string {
    return `${this.base}/${id}/download`;
  }
}
