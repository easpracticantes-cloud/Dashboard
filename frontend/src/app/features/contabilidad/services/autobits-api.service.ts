import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AutobitsField {
  key: string;
  label: string;
}

export interface AutobitsPreview {
  preview_id: string;
  filename: string;
  columns: string[];
  sample_rows: Record<string, unknown>[];
  suggested_mapping: Record<string, string | null>;
  total_rows: number;
  sheet_name: string;
  fields: AutobitsField[];
}

export interface AutobitsBatch {
  id: number;
  filename: string;
  period_start?: string;
  period_end?: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_count: number;
  status: string;
  imported_by: string;
  imported_at: string;
  column_mapping: Record<string, string | null>;
}

export interface AutobitsRecord {
  id: number;
  import_batch_id: number;
  row_number: number;
  proveedor?: string;
  nit?: string;
  numero_compra?: string;
  numero_reserva?: string;
  numero_documento?: string;
  valor?: number;
  fecha?: string;
  concepto?: string;
  observaciones?: string;
  estado_compra?: string;
  estado: string;
  created_at: string;
}

export interface ImportResult {
  batch: AutobitsBatch;
  imported_rows: number;
  skipped_duplicates: number;
  skipped_empty: number;
  parse_errors: string[];
  detected_mapping?: Record<string, string>;
  sheet_name?: string;
  crossing?: { created?: number; error?: string; items?: unknown[] };
  analysis_mode?: string;
  ai_notes?: string;
}

@Injectable({ providedIn: 'root' })
export class AutobitsApiService {
  private readonly base = '/contabilidad/autobits';

  constructor(private readonly http: HttpClient) {}

  /** Importación automática en un solo paso (sin mapeo ni fechas). */
  uploadDirect(file: File, autoCruzar = true): Observable<ImportResult> {
    const form = new FormData();
    form.append('archivo', file, file.name);
    form.append('auto_cruzar', autoCruzar ? 'true' : 'false');
    return this.http.post<ImportResult>(`${this.base}/upload`, form);
  }

  preview(file: File): Observable<AutobitsPreview> {
    const form = new FormData();
    form.append('archivo', file, file.name);
    return this.http.post<AutobitsPreview>(`${this.base}/preview`, form);
  }

  confirmImport(params: {
    preview_id: string;
    mapping: Record<string, string | null>;
    period_start?: string;
    period_end?: string;
  }): Observable<ImportResult> {
    const form = new FormData();
    form.append('preview_id', params.preview_id);
    form.append('mapping_json', JSON.stringify(params.mapping));
    if (params.period_start) form.append('period_start', params.period_start);
    if (params.period_end) form.append('period_end', params.period_end);
    return this.http.post<ImportResult>(`${this.base}/import`, form);
  }

  getLatestBatch(): Observable<AutobitsBatch> {
    return this.http.get<AutobitsBatch>(`${this.base}/batches/latest`);
  }

  listBatches(limit = 20): Observable<{ total: number; items: AutobitsBatch[] }> {
    return this.http.get<{ total: number; items: AutobitsBatch[] }>(
      `${this.base}/batches?limit=${limit}`
    );
  }

  listRecords(params?: {
    limit?: number;
    batch_id?: number;
    search?: string;
    estado?: string;
  }): Observable<{ total: number; items: AutobitsRecord[] }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.batch_id) q.set('batch_id', String(params.batch_id));
    if (params?.search) q.set('search', params.search);
    if (params?.estado) q.set('estado', params.estado);
    const qs = q.toString();
    return this.http.get<{ total: number; items: AutobitsRecord[] }>(
      `${this.base}/records${qs ? '?' + qs : ''}`
    );
  }

  markBatchReady(batchId: number): Observable<{ batch_id: number; records_marked: number }> {
    return this.http.post<{ batch_id: number; records_marked: number }>(
      `${this.base}/batches/${batchId}/mark-ready`,
      {}
    );
  }

  exportBatchUrl(batchId: number): string {
    return `${this.base}/batches/${batchId}/export`;
  }

  /** Limpia Excels Autobits/Cruce, facturas importadas y datos derivados. */
  purgeExcels(confirm = true): Observable<{ ok: boolean; deleted: Record<string, number> }> {
    return this.http.delete<{ ok: boolean; deleted: Record<string, number> }>(
      `${this.base}/excels?confirm=${confirm ? 'true' : 'false'}`
    );
  }
}
