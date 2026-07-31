import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { Conversation, mapConversationDto } from '../models/conversation.model';
import { DashboardOverviewDto } from '../models/dashboard.model';
import { SheetsDashboard } from '../models/sheets-dashboard.model';
import { KpiItem, mapKpiDto } from '../models/kpi.model';
import { AnalyticsFilter, analyticsFilterToParams } from '../models/analytics-filter.model';
import { ApiService } from './api.service';

export interface DashboardOverview {
  kpis: KpiItem[];
  recentConversations: Conversation[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);
  private readonly overviewCache = new Map<string, Observable<DashboardOverview>>();
  private sheetsCache = new Map<string, Observable<SheetsDashboard | null>>();

  getOverview(filter: AnalyticsFilter = {}): Observable<DashboardOverview> {
    const key = JSON.stringify(filter ?? {});
    let cached = this.overviewCache.get(key);
    if (!cached) {
      cached = this.api.get<DashboardOverviewDto>('/dashboard/overview', analyticsFilterToParams(filter)).pipe(
        map((dto) => ({
          kpis: dto.kpis.map((kpi, index) => mapKpiDto(kpi, index)),
          recentConversations: dto.recentConversations.map(mapConversationDto)
        })),
        catchError(() => of({ kpis: [], recentConversations: [] })),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.overviewCache.set(key, cached);
    }
    return cached;
  }

  getSheets(refresh = false, includeRaw = false): Observable<SheetsDashboard | null> {
    const key = includeRaw ? 'raw' : 'slim';
    if (refresh) {
      this.sheetsCache.delete(key);
    }
    let cached = this.sheetsCache.get(key);
    if (!cached) {
      cached = this.api
        .get<SheetsDashboard>('/dashboard/sheets', { refresh: false, includeRaw })
        .pipe(
          catchError(() => of(null)),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      this.sheetsCache.set(key, cached);
    }
    return cached;
  }

  invalidateCache(): void {
    this.overviewCache.clear();
    this.sheetsCache.clear();
  }
}
