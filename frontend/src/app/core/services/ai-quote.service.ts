import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import { QuoteDto } from './commercial.service';

export interface AiQuoteDraft {
  experience: string;
  title: string;
  description: string;
  partySize: number;
  amount: number;
  currency: string;
  serviceDate: string | null;
  validUntil: string | null;
  confidence: number;
  analyzer: string;
  highlights: string[];
}

export interface AiQuoteSuggestion {
  shouldAsk: boolean;
  question: string;
  reason: string;
  conversationId: string;
  clientName: string;
  draft: AiQuoteDraft;
}

export interface AiQuoteOverrides {
  title?: string;
  experience?: string;
  description?: string;
  amount?: number;
  currency?: string;
  partySize?: number;
  serviceDate?: string | null;
  advisorId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AiQuoteService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly appConfig = inject(AppConfigService);

  private get baseUrl(): string {
    return this.appConfig.apiBaseUrl;
  }

  getSuggestion(conversationId: string): Observable<AiQuoteSuggestion | null> {
    return this.api
      .get<AiQuoteSuggestion>(`/ai/conversations/${conversationId}/quote-suggestion`)
      .pipe(catchError(() => of(null)));
  }

  generateQuote(conversationId: string, overrides: AiQuoteOverrides = {}): Observable<QuoteDto | null> {
    return this.api
      .post<QuoteDto>(`/ai/conversations/${conversationId}/quote`, overrides)
      .pipe(catchError(() => of(null)));
  }

  downloadPdf(quoteId: string): Observable<Blob | null> {
    return this.http
      .get(`${this.baseUrl}/ai/quotes/${quoteId}/pdf`, { responseType: 'blob' })
      .pipe(catchError(() => of(null)));
  }
}
