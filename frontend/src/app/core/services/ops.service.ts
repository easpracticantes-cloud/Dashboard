import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';
import { CommercialStatus, QuoteDto, ReservationDto, SaleDto } from './commercial.service';
import { Client } from '../models/client.model';
import { ConversationStatus } from '../models/conversation.model';

export interface MonthlyPoint {
  month: string;
  count: number;
  amount: number;
}

export interface AmountByKey {
  key: string;
  amount: number;
  count: number;
}

export interface ClientTimelineItem {
  type: string;
  title: string;
  at: string;
  refId?: string | null;
}

export interface FunnelMetrics {
  clients: number;
  conversations: number;
  quotes: number;
  reservations: number;
  sales: number;
  quoteToSaleRate: number;
}

export interface OperationalHealth {
  clients: number;
  openConversations: number;
  pendingConversations: number;
  unreadNotifications: number;
  expiringQuotes: number;
  upcomingReservations: number;
  dataQualityScore: number;
}

export interface BusinessPulse {
  openConversations: number;
  expiringQuotes: number;
  salesTodayCount: number;
  salesTodayAmount: number;
  todayReservations: number;
  todayPartySize: number;
  quoteToSaleRate: number;
}

export interface ClientSearchHit {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface ConversationSearchHit {
  id: string;
  clientName?: string | null;
  lastMessagePreview?: string | null;
  status?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OpsService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getHealth(): Observable<OperationalHealth | null> {
    return this.api.get<OperationalHealth>('/ops/insights/health').pipe(catchError(() => of(null)));
  }

  getFunnel(): Observable<FunnelMetrics | null> {
    return this.api.get<FunnelMetrics>('/ops/insights/funnel').pipe(catchError(() => of(null)));
  }

  getExpiringQuotes(days = 7): Observable<QuoteDto[]> {
    return this.api.get<QuoteDto[]>('/ops/quotes/expiring', { days }).pipe(catchError(() => of([])));
  }

  getConfirmedToday(): Observable<ReservationDto[]> {
    return this.api
      .get<ReservationDto[]>('/ops/reservations/confirmed-today')
      .pipe(catchError(() => of([])));
  }

  getSalesSumToday(): Observable<{ count: number; amount: number }> {
    const iso = new Date().toISOString().slice(0, 10);
    return forkJoin({
      sum: this.api.get<{ total?: number }>('/ops/sales/sum', { from: iso, to: iso }).pipe(
        catchError(() => of({ total: 0 }))
      ),
      period: this.api.get<unknown[]>('/ops/sales/period', { from: iso, to: iso }).pipe(
        catchError(() => of([] as unknown[]))
      )
    }).pipe(
      map(({ sum, period }) => ({
        count: period?.length ?? 0,
        amount: Number(sum?.total ?? 0)
      }))
    );
  }

  loadCommandCenter(): Observable<{
    pulse: BusinessPulse;
    funnel: FunnelMetrics | null;
    agenda: ReservationDto[];
    expiring: QuoteDto[];
  }> {
    return forkJoin({
      health: this.getHealth(),
      funnel: this.getFunnel(),
      agenda: this.getConfirmedToday(),
      expiring: this.getExpiringQuotes(7),
      sales: this.getSalesSumToday()
    }).pipe(
      map(({ health, funnel, agenda, expiring, sales }) => {
        const party = agenda.reduce((acc, r) => acc + (r.partySize || 0), 0);
        return {
          funnel,
          agenda,
          expiring,
          pulse: {
            openConversations: health?.openConversations ?? 0,
            expiringQuotes: expiring.length || health?.expiringQuotes || 0,
            salesTodayCount: sales.count,
            salesTodayAmount: sales.amount,
            todayReservations: agenda.length,
            todayPartySize: party,
            quoteToSaleRate: funnel?.quoteToSaleRate ?? 0
          }
        };
      })
    );
  }

  searchClients(q: string): Observable<ClientSearchHit[]> {
    return this.api.get<ClientSearchHit[]>('/ops/clients/search', { q }).pipe(
      map((list) =>
        (list ?? []).map((c: any) => ({
          id: c.id,
          name: c.name ?? c.fullName ?? c.nombre ?? 'Cliente',
          phone: c.phone ?? c.telefono,
          email: c.email ?? c.correo
        }))
      ),
      catchError(() => of([]))
    );
  }

  searchConversations(q: string): Observable<ConversationSearchHit[]> {
    return this.api.get<any[]>('/ops/inbox/search', { q }).pipe(
      map((list) =>
        (list ?? []).slice(0, 8).map((c) => ({
          id: c.id,
          clientName: c.clientName ?? c.client?.name ?? 'Conversación',
          lastMessagePreview: c.lastMessagePreview ?? c.lastMessage,
          status: c.status
        }))
      ),
      catchError(() => of([]))
    );
  }

  notifyExpiringQuotes(): Observable<number> {
    return this.api.post<{ created?: number }>('/ops/notifications/quotes-expiring', {}).pipe(
      map((r) => r?.created ?? 0),
      catchError(() => of(0))
    );
  }

  // —— Inbox ops ——
  listStaleConversationIds(days = 7): Observable<string[]> {
    return this.api.get<string[]>('/ops/inbox/stale', { days }).pipe(catchError(() => of([])));
  }

  bulkUpdateStatus(ids: string[], status: ConversationStatus): Observable<number> {
    return this.api
      .post<{ updated?: number }>('/ops/inbox/bulk-status', { ids, status })
      .pipe(
        map((r) => r?.updated ?? 0),
        catchError(() => of(0))
      );
  }

  bulkAssign(conversationIds: string[], userId: string): Observable<number> {
    return this.api
      .post<{ updated?: number }>('/ops/inbox/bulk-assign', { conversationIds, userId })
      .pipe(
        map((r) => r?.updated ?? idsOrZero(r)),
        catchError(() => of(0))
      );
  }

  markConversationRead(id: string): Observable<boolean> {
    return this.api.post<void>(`/ops/inbox/${id}/read`, {}).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  closeConversation(id: string, notes?: string): Observable<boolean> {
    return this.api.post<void>(`/ops/inbox/${id}/close`, notes ? { notes } : {}).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  archiveConversation(id: string): Observable<boolean> {
    return this.api.post(`/ops/inbox/${id}/archive`, {}).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  reopenConversation(id: string): Observable<boolean> {
    return this.api.post(`/ops/inbox/${id}/reopen`, {}).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  transferConversation(id: string, userId: string): Observable<boolean> {
    return this.api.post<void>(`/ops/inbox/${id}/transfer`, { userId }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  addConversationLabels(id: string, tags: string[]): Observable<boolean> {
    return this.api.post<void>(`/ops/inbox/${id}/labels/add`, { tags }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  removeConversationLabels(id: string, tags: string[]): Observable<boolean> {
    return this.api.post<void>(`/ops/inbox/${id}/labels/remove`, { tags }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  markAllNotificationsRead(): Observable<number> {
    return this.api.post<{ updated: number }>('/ops/notifications/mark-all-read', {}).pipe(
      map((r) => Number(r?.updated ?? 0)),
      catchError(() => of(0))
    );
  }

  // —— Comercial ops ——
  changeQuoteStatus(id: string, status: CommercialStatus): Observable<QuoteDto | null> {
    return this.api.patch<QuoteDto>(`/ops/quotes/${id}/status`, { status }).pipe(catchError(() => of(null)));
  }

  cloneQuote(id: string): Observable<{ newId: string; newCode: string } | null> {
    return this.api
      .post<{ sourceId: string; newId: string; newCode: string }>(`/ops/quotes/${id}/clone`, {})
      .pipe(
        map((r) => (r ? { newId: r.newId, newCode: r.newCode } : null)),
        catchError(() => of(null))
      );
  }

  extendQuoteValidity(id: string, validUntil: string): Observable<QuoteDto | null> {
    return this.api
      .patch<QuoteDto>(`/ops/quotes/${id}/extend-validity`, { validUntil })
      .pipe(catchError(() => of(null)));
  }

  convertQuoteToReservation(
    id: string,
    body: { experienceName?: string; partySize?: number; reservationDate?: string; amount?: number } = {}
  ): Observable<ReservationDto | null> {
    return this.api
      .post<ReservationDto>(`/ops/quotes/${id}/convert-reservation`, body)
      .pipe(catchError(() => of(null)));
  }

  convertReservationToSale(
    id: string,
    body: { concept?: string; amount?: number; paymentMethod?: string } = {}
  ): Observable<unknown | null> {
    return this.api.post(`/ops/reservations/${id}/convert-sale`, body).pipe(catchError(() => of(null)));
  }

  cancelReservation(id: string): Observable<boolean> {
    return this.api.post<void>(`/ops/reservations/${id}/cancel`, {}).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  // —— Clientes calidad ——
  listVipClients(): Observable<{ id: string }[]> {
    return this.api.get<{ id: string }[]>('/ops/clients/vip').pipe(catchError(() => of([])));
  }

  listInactiveClients(): Observable<{ id: string }[]> {
    return this.api.get<{ id: string }[]>('/ops/clients/inactive').pipe(catchError(() => of([])));
  }

  listUnassignedClients(): Observable<{ id: string }[]> {
    return this.api.get<{ id: string }[]>('/ops/clients/unassigned').pipe(catchError(() => of([])));
  }

  listNeverContactedClients(): Observable<{ id: string }[]> {
    return this.api.get<{ id: string }[]>('/ops/clients/never-contacted').pipe(catchError(() => of([])));
  }

  assignClient(id: string, userId: string): Observable<Client | null> {
    return this.api.post<Client>(`/ops/clients/${id}/assign`, { userId }).pipe(catchError(() => of(null)));
  }

  touchClient(id: string): Observable<Client | null> {
    return this.api.post<Client>(`/ops/clients/${id}/touch`, {}).pipe(catchError(() => of(null)));
  }

  // —— Hub de configuración / salud ——
  getIntegrationsHealth(): Observable<{ code: string; status: string; description?: string }[]> {
    return this.api
      .get<{ code: string; status: string; description?: string }[]>('/ops/integrations/health')
      .pipe(catchError(() => of([])));
  }

  getOperationalDigest(): Observable<Record<string, unknown> | null> {
    return this.api.get<Record<string, unknown>>('/ops/digest/operational').pipe(catchError(() => of(null)));
  }

  getSyncReadiness(): Observable<Record<string, unknown> | null> {
    return this.api.get<Record<string, unknown>>('/ops/quality/sync-readiness').pipe(catchError(() => of(null)));
  }

  getDataQuality(): Observable<Record<string, unknown> | null> {
    return this.api.get<Record<string, unknown>>('/ops/insights/data-quality').pipe(catchError(() => of(null)));
  }

  getRecentAudit(limit = 20): Observable<
    { id: string; action: string; entityType: string; entityId?: string; details?: string; createdAt: string }[]
  > {
    return this.api
      .get<
        { id: string; action: string; entityType: string; entityId?: string; details?: string; createdAt: string }[]
      >('/ops/audit/recent', { limit })
      .pipe(catchError(() => of([])));
  }

  getActiveUsers(): Observable<{ id: string; fullName?: string; username?: string; role?: string }[]> {
    return this.api
      .get<{ id: string; fullName?: string; username?: string; role?: string }[]>('/ops/users/active')
      .pipe(catchError(() => of([])));
  }

  getUsersByRole(): Observable<{ role: string; count: number }[]> {
    return this.api.get<{ role: string; count: number }[]>('/ops/users/count-by-role').pipe(catchError(() => of([])));
  }

  getQualitySnapshot(): Observable<{
    missingEmail: number;
    missingAdvisor: number;
    duplicatePhones: number;
    conversationsMissingKey: number;
  }> {
    return forkJoin({
      missingEmail: this.api
        .get<{ count?: number }>('/ops/quality/clients-missing-email')
        .pipe(catchError(() => of({ count: 0 }))),
      missingAdvisor: this.api
        .get<{ count?: number }>('/ops/quality/quotes-missing-advisor')
        .pipe(catchError(() => of({ count: 0 }))),
      duplicatePhones: this.api
        .get<unknown[]>('/ops/quality/duplicate-phones')
        .pipe(catchError(() => of([] as unknown[]))),
      conversationsMissingKey: this.api
        .get<{ count?: number }>('/ops/quality/conversations-missing-key')
        .pipe(catchError(() => of({ count: 0 })))
    }).pipe(
      map((r) => ({
        missingEmail: Number(r.missingEmail?.count ?? 0),
        missingAdvisor: Number(r.missingAdvisor?.count ?? 0),
        duplicatePhones: r.duplicatePhones?.length ?? 0,
        conversationsMissingKey: Number(r.conversationsMissingKey?.count ?? 0)
      }))
    );
  }

  // —— Insights ops ——
  getAdvisorWorkload(): Observable<{ userId: string; fullName: string; openConversations: number; unreadMessages: number; salesCount: number }[]> {
    return this.api
      .get<{ userId: string; fullName: string; openConversations: number; unreadMessages: number; salesCount: number }[]>(
        '/ops/insights/advisor-workload'
      )
      .pipe(catchError(() => of([])));
  }

  getDailyVolume(days = 30): Observable<{ day: string; conversations: number }[]> {
    return this.api
      .get<{ day: string; conversations: number }[]>('/ops/insights/daily-volume', { days })
      .pipe(catchError(() => of([])));
  }

  getChannelsInsight(): Observable<{ key: string; count: number }[]> {
    return this.api.get<{ key: string; count: number }[]>('/ops/insights/channels').pipe(catchError(() => of([])));
  }

  getPrioritiesInsight(): Observable<{ key: string; count: number }[]> {
    return this.api.get<{ key: string; count: number }[]>('/ops/insights/priorities').pipe(catchError(() => of([])));
  }

  getTopClients(limit = 10): Observable<{ clientId: string; clientName: string; total: number; sales: number }[]> {
    return this.api
      .get<{ clientId: string; clientName: string; total: number; sales: number }[]>('/ops/insights/top-clients', {
        limit
      })
      .pipe(catchError(() => of([])));
  }

  getConversionQuoteSale(): Observable<{ ratePct: number } | null> {
    return this.api.get<{ ratePct: number }>('/ops/insights/conversion-quote-sale').pipe(catchError(() => of(null)));
  }

  getResponseLag(): Observable<{
    conversationsSampled?: number;
    avgHoursBetweenCreateAndLastMessage?: number;
    note?: string;
  } | null> {
    return this.api
      .get<{
        conversationsSampled?: number;
        avgHoursBetweenCreateAndLastMessage?: number;
        note?: string;
      }>('/ops/insights/response-lag')
      .pipe(catchError(() => of(null)));
  }

  getCommercialDigest(): Observable<Record<string, unknown> | null> {
    return this.api.get<Record<string, unknown>>('/ops/commercial/digest').pipe(catchError(() => of(null)));
  }

  // —— Series mensuales e ingresos ——
  getSalesMonthlySeries(months = 6): Observable<MonthlyPoint[]> {
    return this.api.get<MonthlyPoint[]>('/ops/sales/monthly-series', { months }).pipe(catchError(() => of([])));
  }

  getQuotesMonthlySeries(months = 6): Observable<MonthlyPoint[]> {
    return this.api.get<MonthlyPoint[]>('/ops/quotes/monthly-series', { months }).pipe(catchError(() => of([])));
  }

  getRevenueByPaymentMethod(): Observable<AmountByKey[]> {
    return this.api.get<AmountByKey[]>('/ops/sales/by-payment-method').pipe(catchError(() => of([])));
  }

  getQuoteAmountsByStatus(): Observable<AmountByKey[]> {
    return this.api.get<AmountByKey[]>('/ops/quotes/amounts-by-status').pipe(catchError(() => of([])));
  }

  getCommercialPipeline(): Observable<Record<string, number>> {
    return this.api.get<Record<string, number>>('/ops/commercial/pipeline').pipe(catchError(() => of({})));
  }

  getClientsBySource(): Observable<{ source: string; count: number }[]> {
    return this.api
      .get<{ source: string; count: number }[]>('/ops/clients/count-by-source')
      .pipe(catchError(() => of([])));
  }

  // —— Ficha 360 del cliente ——
  getClientTimeline(clientId: string): Observable<ClientTimelineItem[]> {
    return this.api.get<ClientTimelineItem[]>(`/ops/clients/${clientId}/timeline`).pipe(catchError(() => of([])));
  }

  getQuotesByClient(clientId: string): Observable<QuoteDto[]> {
    return this.api.get<QuoteDto[]>(`/ops/quotes/by-client/${clientId}`).pipe(catchError(() => of([])));
  }

  getReservationsByClient(clientId: string): Observable<ReservationDto[]> {
    return this.api.get<ReservationDto[]>(`/ops/reservations/by-client/${clientId}`).pipe(catchError(() => of([])));
  }

  getSalesByClient(clientId: string): Observable<SaleDto[]> {
    return this.api.get<SaleDto[]>(`/ops/sales/by-client/${clientId}`).pipe(catchError(() => of([])));
  }

  setUserActive(id: string, active: boolean): Observable<boolean> {
    return this.http
      .patch(`${this.baseUrl}/ops/users/${id}/active`, null, { params: { active: String(active) } })
      .pipe(
        map(() => true),
        catchError(() => of(false))
      );
  }

  exportAdvisorPerformanceCsv(): Observable<Blob | null> {
    return this.downloadCsv('/ops/export/advisor-performance.csv');
  }

  // —— Exports CSV ——
  exportClientsCsv(): Observable<Blob | null> {
    return this.downloadCsv('/ops/clients/export.csv');
  }

  exportQuotesCsv(): Observable<Blob | null> {
    return this.downloadCsv('/ops/export/quotes.csv');
  }

  exportSalesCsv(): Observable<Blob | null> {
    return this.downloadCsv('/ops/export/sales.csv');
  }

  exportReservationsCsv(): Observable<Blob | null> {
    return this.downloadCsv('/ops/export/reservations.csv');
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private downloadCsv(path: string): Observable<Blob | null> {
    return this.http
      .get(`${this.baseUrl}${path}`, { responseType: 'blob' })
      .pipe(catchError(() => of(null)));
  }
}

function idsOrZero(r: { updated?: number } | null | undefined): number {
  return r?.updated ?? 0;
}
