import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ContabilidadUserContext } from './contabilidad-user-context';

@Injectable({ providedIn: 'root' })
export class PeriodsApiService {
  private readonly http = inject(HttpClient);
  private readonly userCtx = inject(ContabilidadUserContext);
  private readonly base = '/contabilidad/periods';

  status(weekRef?: string): Observable<Record<string, unknown>> {
    const q = weekRef ? `?week_ref=${encodeURIComponent(weekRef)}` : '';
    return this.http.get<Record<string, unknown>>(`${this.base}/status${q}`);
  }

  list(limit = 20): Observable<{ items: Record<string, unknown>[] }> {
    return this.http.get<{ items: Record<string, unknown>[] }>(`${this.base}?limit=${limit}`);
  }

  close(weekRef?: string, resumen?: string): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/close`,
      this.userCtx.withUsuario({
        week_ref: weekRef ?? null,
        observaciones: resumen ?? null,
        resumen: resumen ?? null,
      })
    );
  }

  reopen(weekRef: string, motivo: string): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/reopen`,
      this.userCtx.withUsuario({ week_ref: weekRef, motivo })
    );
  }
}
