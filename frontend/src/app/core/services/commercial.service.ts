import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ApiService } from './api.service';

export type CommercialStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CONFIRMED'
  | 'COMPLETED';

export interface QuoteDto {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  advisorId?: string | null;
  advisorName?: string | null;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: CommercialStatus;
  validUntil?: string | null;
  issuedAt?: string | null;
  createdAt: string;
}

export interface ReservationDto {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  advisorId?: string | null;
  advisorName?: string | null;
  quoteId?: string | null;
  experienceName: string;
  partySize: number;
  reservationDate: string;
  amount: number;
  status: CommercialStatus;
  notes?: string | null;
  createdAt: string;
}

export interface SaleDto {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  advisorId?: string | null;
  advisorName?: string | null;
  reservationId?: string | null;
  concept: string;
  amount: number;
  currency: string;
  saleDate: string;
  status: CommercialStatus;
  paymentMethod?: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CommercialService {
  private readonly api = inject(ApiService);

  listQuotes(): Observable<QuoteDto[]> {
    return this.api.get<QuoteDto[]>('/quotes').pipe(catchError(() => of([])));
  }

  createQuote(body: unknown): Observable<QuoteDto | null> {
    return this.api.post<QuoteDto>('/quotes', body).pipe(catchError(() => of(null)));
  }

  deleteQuote(id: string): Observable<boolean> {
    return this.api.delete<void>(`/quotes/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  listReservations(): Observable<ReservationDto[]> {
    return this.api.get<ReservationDto[]>('/reservations').pipe(catchError(() => of([])));
  }

  createReservation(body: unknown): Observable<ReservationDto | null> {
    return this.api.post<ReservationDto>('/reservations', body).pipe(catchError(() => of(null)));
  }

  deleteReservation(id: string): Observable<boolean> {
    return this.api.delete<void>(`/reservations/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  listSales(): Observable<SaleDto[]> {
    return this.api.get<SaleDto[]>('/sales').pipe(catchError(() => of([])));
  }

  createSale(body: unknown): Observable<SaleDto | null> {
    return this.api.post<SaleDto>('/sales', body).pipe(catchError(() => of(null)));
  }

  deleteSale(id: string): Observable<boolean> {
    return this.api.delete<void>(`/sales/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
