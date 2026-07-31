import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { SettingDto, SettingUpdateItem } from '../models/settings.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(ApiService);
  private cached$?: Observable<SettingDto[]>;

  getSettings(): Observable<SettingDto[]> {
    if (!this.cached$) {
      this.cached$ = this.api.get<SettingDto[]>('/settings').pipe(
        catchError(() => of([])),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.cached$;
  }

  updateSettings(items: SettingUpdateItem[]): Observable<SettingDto[] | null> {
    return this.api.put<SettingDto[]>('/settings', { settings: items }).pipe(
      map((result) => {
        this.cached$ = undefined;
        return result;
      }),
      catchError(() => of(null))
    );
  }

  /** Invalida caché local (p.ej. tras sync manual). */
  invalidateCache(): void {
    this.cached$ = undefined;
  }
}
