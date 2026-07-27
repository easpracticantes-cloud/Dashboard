import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { IntegrationStatusDto } from '../models/integration.model';
import { ApiService } from './api.service';

export interface SheetsSyncResult {
  success: boolean;
  message: string;
  rowsRead: number;
  clientsUpserted: number;
  conversationsUpserted: number;
  syncedAt: string;
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
}
