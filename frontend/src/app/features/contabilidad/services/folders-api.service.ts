import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FolderDocumentSummary {
  id: number;
  filename: string;
  estado: string;
  numero_documento?: string | null;
  proveedor_nombre?: string | null;
  total?: number | null;
  requiere_revision?: boolean;
  fecha_emision?: string | null;
  tipo?: string | null;
  contramarcado?: {
    value: string;
    status: string;
    com?: string | null;
    source?: string | null;
    confidence?: number | null;
    warning?: string | null;
  } | null;
}

export interface InvoiceFolder {
  id: number;
  name: string;
  week_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status: string;
  document_ids: number[];
  document_count: number;
  documents?: FolderDocumentSummary[];
  autobits_batch_id?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class FoldersApiService {
  private readonly base = '/contabilidad/folders';
  private readonly http = inject(HttpClient);

  list(limit = 40): Observable<{ total: number; items: InvoiceFolder[] }> {
    return this.http.get<{ total: number; items: InvoiceFolder[] }>(`${this.base}?limit=${limit}`);
  }

  get(id: number): Observable<InvoiceFolder> {
    return this.http.get<InvoiceFolder>(`${this.base}/${id}`);
  }

  create(name: string, notes?: string): Observable<InvoiceFolder> {
    return this.http.post<InvoiceFolder>(this.base, { name, notes: notes || null });
  }

  patch(
    id: number,
    body: {
      name?: string;
      status?: string;
      notes?: string;
      autobits_batch_id?: number | null;
      clear_autobits?: boolean;
    }
  ): Observable<InvoiceFolder> {
    return this.http.patch<InvoiceFolder>(`${this.base}/${id}`, body);
  }

  addDocuments(id: number, documentIds: number[]): Observable<{ ok: boolean; added: number; folder: InvoiceFolder }> {
    return this.http.post<{ ok: boolean; added: number; folder: InvoiceFolder }>(
      `${this.base}/${id}/documents`,
      { document_ids: documentIds }
    );
  }

  removeDocument(id: number, documentId: number): Observable<{ ok: boolean; folder: InvoiceFolder }> {
    return this.http.delete<{ ok: boolean; folder: InvoiceFolder }>(
      `${this.base}/${id}/documents/${documentId}`
    );
  }

  delete(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }

  ask(
    id: number,
    pregunta: string
  ): Observable<{
    ok: boolean;
    respuesta: string;
    documentos: number;
    autobits: number;
    folder_id: number;
    autobits_batch_id?: number | null;
    error?: string | null;
  }> {
    return this.http.post<{
      ok: boolean;
      respuesta: string;
      documentos: number;
      autobits: number;
      folder_id: number;
      autobits_batch_id?: number | null;
      error?: string | null;
    }>(`${this.base}/${id}/ask`, { pregunta });
  }

  recontramarcado(
    id: number,
    opts: {
      onlyMissingCom?: boolean;
      reset?: boolean;
      autobitsBatchId?: number | null;
    } = {}
  ): Observable<{
    ok: boolean;
    updated: number;
    skipped: number;
    total: number;
    message: string;
    folder: InvoiceFolder;
    items?: Array<{ id: number; status?: string; com?: string | null; value?: string | null }>;
  }> {
    return this.http.post<{
      ok: boolean;
      updated: number;
      skipped: number;
      total: number;
      message: string;
      folder: InvoiceFolder;
      items?: Array<{ id: number; status?: string; com?: string | null; value?: string | null }>;
    }>(`${this.base}/${id}/contramarcado`, {
      only_missing_com: opts.onlyMissingCom ?? false,
      reset: opts.reset ?? true,
      autobits_batch_id: opts.autobitsBatchId ?? null,
    });
  }
}
