import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { AnalyticsDto } from '../models/dashboard.model';
import { AnalyticsFilter, analyticsFilterToParams } from '../models/analytics-filter.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly api = inject(ApiService);

  getAnalytics(filter: AnalyticsFilter = {}): Observable<AnalyticsDto> {
    return this.api
      .get<AnalyticsDto>('/dashboard/analytics', analyticsFilterToParams(filter))
      .pipe(catchError(() => of({ series: [], summary: [] })));
  }
}
