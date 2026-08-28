import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DocumentSummary {
  id: number;
  filename: string;
  tipo: string;
  origen: string;
  estado: string;
  proveedor_nombre?: string;
  nit?: string;
  numero_documento?: string;
  total?: number;
  confidence_global?: number;
  requiere_revision: boolean;
  received_at: string;
}

export interface DocumentListResponse {
  total: number;
  items: DocumentSummary[];
}

export interface DocumentDetail {
  id: number;
  filename: string;
  tipo: string;
  origen: string;
  estado: string;
  provider?: { id: number; nombre: string; nit?: string };
  numero_documento?: string;
  fecha_emision?: string;
  subtotal?: number;
  iva?: number;
  total?: number;
  moneda?: string;
  concepto?: string;
  metodo_ocr?: string;
  confidence: { global?: number; fields: Record<string, number> };
  requiere_revision: boolean;
  observaciones?: string;
  extracted: Record<string, unknown>;
  ocr_preview: string;
  preview_url?: string;
  received_at: string;
  updated_at: string;
}

export interface UploadResponse {
  document: DocumentSummary;
  duplicate_warning?: string;
  duplicate_document_id?: number;
  process_error?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly base = '/contabilidad/documents';

  constructor(private readonly http: HttpClient) {}

  list(params?: {
    limit?: number;
    offset?: number;
    estado?: string;
    tipo?: string;
    search?: string;
  }): Observable<DocumentListResponse> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    if (params?.estado) q.set('estado', params.estado);
    if (params?.tipo) q.set('tipo', params.tipo);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return this.http.get<DocumentListResponse>(
      `${this.base}${qs ? '?' + qs : ''}`
    );
  }

  get(id: number): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(`${this.base}/${id}`);
  }

  upload(file: File, tipo = 'FACTURA'): Observable<UploadResponse> {
    const form = new FormData();
    form.append('archivo', file, file.name);
    form.append('tipo', tipo);
    form.append('origen', 'CARGA_MANUAL');
    form.append('auto_procesar', 'true');
    return this.http.post<UploadResponse>(`${this.base}/upload`, form);
  }

  process(id: number, solicitud: string): Observable<{ ok: boolean; error?: string }> {
    const form = new FormData();
    form.append('solicitud', solicitud);
    return this.http.post<{ ok: boolean; error?: string }>(
      `${this.base}/${id}/process`,
      form
    );
  }

  updateEstado(id: number, estado: string): Observable<DocumentSummary> {
    return this.http.patch<DocumentSummary>(`${this.base}/${id}/estado`, {
      estado,
      usuario: 'ANDREA',
    });
  }

  delete(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
}
