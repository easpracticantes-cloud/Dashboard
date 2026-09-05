import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { IntegrationStatusDto } from '../models/integration.model';
import { ApiService } from './api.service';
import { SeguimientoWhatsapp, VentaSheet } from '../models/sheets-dashboard.model';

export interface SheetsSyncResult {
  success: boolean;
  message: string;
  rowsRead: number;
  clientsUpserted: number;
  conversationsUpserted: number;
  syncedAt: string;
}

export interface SheetRowWriteResult {
  success: boolean;
  message: string;
  sheetName?: string;
  rowNumber?: number | null;
  updatedFields?: string[];
}

@Injectable({ providedIn: 'root' })
export class IntegrationsService {
  private readonly api = inject(ApiService);

  getStatus(): Observable<IntegrationStatusDto[]> {
    return this.api.get<IntegrationStatusDto[]>('/integrations/status').pipe(catchError(() => of([])));
  }

  syncSheets(): Observable<SheetsSyncResult | null> {
    return this.api.post<SheetsSyncResult>('/integrations/sheets/sync', {}).pipe(catchError(() => of(null)));
  }

  appendSeguimiento(row: Partial<SeguimientoWhatsapp> & Record<string, unknown>): Observable<SheetRowWriteResult> {
    return this.api.post<SheetRowWriteResult>('/integrations/sheets/seguimiento', row).pipe(
      catchError((err) =>
        throwError(() => ({
          message:
            err?.error?.message ||
            err?.error?.detail ||
            err?.error?.error ||
            err?.message ||
            'No se pudo agregar la fila al Excel'
        }))
      )
    );
  }

  updateSeguimiento(row: Partial<SeguimientoWhatsapp> & Record<string, unknown>): Observable<SheetRowWriteResult> {
    return this.api.put<SheetRowWriteResult>('/integrations/sheets/seguimiento', row).pipe(
      catchError((err) =>
        throwError(() => ({
          message:
            err?.error?.message ||
            err?.error?.detail ||
            err?.error?.error ||
            err?.message ||
            'No se pudo guardar en Google Sheets'
        }))
      )
    );
  }

  updateVenta(row: Partial<VentaSheet> & Record<string, unknown>): Observable<SheetRowWriteResult> {
    return this.api.put<SheetRowWriteResult>('/integrations/sheets/venta', row).pipe(
      catchError((err) =>
        throwError(() => ({
          message:
            err?.error?.message ||
            err?.error?.detail ||
            err?.error?.error ||
            err?.message ||
            'No se pudo guardar la venta en Google Sheets'
        }))
      )
    );
  }
}
