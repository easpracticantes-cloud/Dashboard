import { ConversationDto } from './conversation.model';
import { KpiDto } from './kpi.model';

/** Mirrors the backend `DashboardOverviewDto` record exactly. */
export interface DashboardOverviewDto {
  kpis: KpiDto[];
  recentConversations: ConversationDto[];
}

/** Mirrors the backend `ChartSeriesDto` record exactly. */
export interface ChartSeriesDto {
  name: string;
  labels: string[];
  values: number[];
}

/** Mirrors the backend `AnalyticsDto` record exactly. */
export interface AnalyticsDto {
  series: ChartSeriesDto[];
  summary: KpiDto[];
}
