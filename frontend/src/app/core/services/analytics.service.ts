import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { AnalyticsDto } from '../models/dashboard.model';
import { AnalyticsFilter, analyticsFilterToParams } from '../models/analytics-filter.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly api = inject(ApiService);
  private readonly cache = new Map<string, Observable<AnalyticsDto>>();

  getAnalytics(filter: AnalyticsFilter = {}): Observable<AnalyticsDto> {
    const key = JSON.stringify(filter ?? {});
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.api
        .get<AnalyticsDto>('/dashboard/analytics', analyticsFilterToParams(filter))
        .pipe(
          catchError(() => of({ series: [], summary: [] })),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      this.cache.set(key, cached);
    }
    return cached;
  }

  invalidateCache(): void {
    this.cache.clear();
  }
}
