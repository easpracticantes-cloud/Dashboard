import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ReportSummaryDto } from '../models/report.model';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);
  private readonly appConfig = inject(AppConfigService);

  private get baseUrl(): string {
    return this.appConfig.apiBaseUrl;
  }

  getConversationsSummary(): Observable<ReportSummaryDto | null> {
    return this.api.get<ReportSummaryDto>('/reports/conversations').pipe(catchError(() => of(null)));
  }

  exportCsv(): Observable<Blob | null> {
    return this.http
      .get(`${this.baseUrl}/reports/conversations/export/csv`, { responseType: 'blob' })
      .pipe(catchError(() => of(null)));
  }

  exportPdf(): Observable<Blob | null> {
    return this.http
      .get(`${this.baseUrl}/reports/conversations/export/pdf`, { responseType: 'blob' })
      .pipe(catchError(() => of(null)));
  }
}
