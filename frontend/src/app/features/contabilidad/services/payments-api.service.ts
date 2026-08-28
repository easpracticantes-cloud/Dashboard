import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PaymentSummary {
  id: number;
  document_id: number;
  document_filename?: string;
  crossing_id?: number;
  proveedor?: string;
  numero_compra?: string;
  numero_reserva?: string;
  numero_documento?: string;
  valor?: number;
  estado: string;
  observaciones?: string;
  approved_by?: string;
  paid_by?: string;
  has_receipt: boolean;
  created_at: string;
  receipts?: {
    id: number;
    filename: string;
    contramarcado: boolean;
    preview_url: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly base = '/contabilidad/payments';

  constructor(private readonly http: HttpClient) {}

  list(params?: {
    limit?: number;
    estado?: string;
    search?: string;
  }): Observable<{ total: number; items: PaymentSummary[] }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.estado) q.set('estado', params.estado);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return this.http.get<{ total: number; items: PaymentSummary[] }>(
      `${this.base}${qs ? '?' + qs : ''}`
    );
  }

  createFromCrossing(crossingId: number): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(this.base, {
      crossing_id: crossingId,
      usuario: 'ANDREA',
    });
  }

  approve(id: number): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(`${this.base}/${id}/approve`, {
      usuario: 'ANDREA',
    });
  }

  markPaid(id: number, observaciones?: string): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(`${this.base}/${id}/mark-paid`, {
      usuario: 'ANDREA',
      observaciones,
    });
  }

  uploadReceipt(
    id: number,
    file: File,
    contramarcado = false
  ): Observable<PaymentSummary> {
    const form = new FormData();
    form.append('archivo', file, file.name);
    form.append('contramarcado', String(contramarcado));
    form.append('usuario', 'ANDREA');
    return this.http.post<PaymentSummary>(`${this.base}/${id}/receipt`, form);
  }

  complete(id: number): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(`${this.base}/${id}/complete`, {
      usuario: 'ANDREA',
    });
  }

  exportPendingUrl(): string {
    return `${this.base}/export/pending`;
  }
}
