import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
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

const SHEETS_SUMMARY_KEY = 'sig.sheets.summary.v1';
const SHEETS_FULL_KEY = 'sig.sheets.full.v1';

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

  /** KPIs + agregados (~KB). First paint &lt; 1s. */
  getSheetsSummary(force = false): Observable<SheetsDashboard | null> {
    return this.getSheetsInternal('summary', { summary: true, includeRaw: false }, force, SHEETS_SUMMARY_KEY);
  }

  /** Payload completo sin matrices (para tablas). */
  getSheetsFull(force = false): Observable<SheetsDashboard | null> {
    return this.getSheetsInternal('full', { summary: false, includeRaw: false }, force, SHEETS_FULL_KEY);
  }

  getSheets(refresh = false, includeRaw = false): Observable<SheetsDashboard | null> {
    if (includeRaw) {
      return this.getSheetsInternal('raw', { summary: false, includeRaw: true }, refresh);
    }
    return this.getSheetsFull(refresh);
  }

  /** Snapshot instantáneo desde sessionStorage (stale-while-revalidate). */
  peekCachedSummary(): SheetsDashboard | null {
    return this.readStorage(SHEETS_SUMMARY_KEY) ?? this.readStorage(SHEETS_FULL_KEY);
  }

  invalidateCache(): void {
    this.overviewCache.clear();
    this.sheetsCache.clear();
  }

  private getSheetsInternal(
    cacheKey: string,
    params: { summary: boolean; includeRaw: boolean },
    force: boolean,
    storageKey?: string
  ): Observable<SheetsDashboard | null> {
    if (force) {
      this.sheetsCache.delete(cacheKey);
    }
    let cached = this.sheetsCache.get(cacheKey);
    if (!cached) {
      cached = this.api
        .get<SheetsDashboard>('/dashboard/sheets', {
          refresh: false,
          includeRaw: params.includeRaw,
          summary: params.summary
        })
        .pipe(
          tap((payload) => {
            if (payload && storageKey) {
              this.writeStorage(storageKey, payload);
            }
          }),
          catchError(() => of(this.readStorage(storageKey ?? '') || null)),
          shareReplay({ bufferSize: 1, refCount: true })
        );
      this.sheetsCache.set(cacheKey, cached);
    }
    return cached;
  }

  private readStorage(key: string): SheetsDashboard | null {
    if (!key || typeof sessionStorage === 'undefined') {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as SheetsDashboard;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, payload: SheetsDashboard): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      // Evitar cuotas: summary siempre; full solo si es razonable
      const json = JSON.stringify(payload);
      if (key === SHEETS_FULL_KEY && json.length > 1_500_000) {
        return;
      }
      sessionStorage.setItem(key, json);
    } catch {
      // quota exceeded — ignore
    }
  }
}
