import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ContabilidadUserContext } from './contabilidad-user-context';

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
  private readonly http = inject(HttpClient);
  private readonly userCtx = inject(ContabilidadUserContext);

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
    return this.http.post<PaymentSummary>(this.base, this.userCtx.withUsuario({
      crossing_id: crossingId,
    }));
  }

  approve(id: number): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(
      `${this.base}/${id}/approve`,
      this.userCtx.withUsuario({})
    );
  }

  markPaid(id: number, observaciones?: string): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(
      `${this.base}/${id}/mark-paid`,
      this.userCtx.withUsuario({ observaciones })
    );
  }

  uploadReceipt(
    id: number,
    file: File,
    contramarcado = false
  ): Observable<PaymentSummary> {
    const form = new FormData();
    form.append('archivo', file, file.name);
    form.append('contramarcado', String(contramarcado));
    form.append('usuario', this.userCtx.username());
    return this.http.post<PaymentSummary>(`${this.base}/${id}/receipt`, form);
  }

  complete(id: number): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(
      `${this.base}/${id}/complete`,
      this.userCtx.withUsuario({})
    );
  }

  annul(id: number, motivo: string): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(
      `${this.base}/${id}/annul`,
      this.userCtx.withUsuario({ motivo })
    );
  }

  /** Corrige el valor dejando rastro (API `/adjust`). */
  adjust(id: number, valor: number, motivo: string): Observable<PaymentSummary> {
    return this.http.post<PaymentSummary>(
      `${this.base}/${id}/adjust`,
      this.userCtx.withUsuario({ valor, motivo })
    );
  }

  exportPendingUrl(): string {
    return `${this.base}/export/pending`;
  }
}
