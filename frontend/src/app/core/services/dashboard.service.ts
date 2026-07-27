import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
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

  getOverview(filter: AnalyticsFilter = {}): Observable<DashboardOverview> {
    return this.api.get<DashboardOverviewDto>('/dashboard/overview', analyticsFilterToParams(filter)).pipe(
      map((dto) => ({
        kpis: dto.kpis.map((kpi, index) => mapKpiDto(kpi, index)),
        recentConversations: dto.recentConversations.map(mapConversationDto)
      })),
      catchError(() => of({ kpis: [], recentConversations: [] }))
    );
  }

  getSheets(refresh = false): Observable<SheetsDashboard | null> {
    return this.api.get<SheetsDashboard>('/dashboard/sheets', { refresh }).pipe(
      catchError(() => of(null))
    );
  }
}
