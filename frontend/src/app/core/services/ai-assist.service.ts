import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from './api.service';

export interface ReplySuggestion {
  reply: string;
  analyzer: string;
}

export interface ConversationSummary {
  summary: string;
  keyPoints: string[];
  nextStep: string;
  analyzer: string;
}

export type SentimentValue = 'POSITIVO' | 'NEUTRO' | 'RIESGO';
export type UrgencyValue = 'ALTA' | 'MEDIA' | 'BAJA';

export interface SentimentInsight {
  sentiment: SentimentValue;
  intent: string;
  urgency: UrgencyValue;
  score: number;
  signals: string[];
}

@Injectable({ providedIn: 'root' })
export class AiAssistService {
  private readonly api = inject(ApiService);

  suggestReply(conversationId: string): Observable<ReplySuggestion | null> {
    return this.api
      .get<ReplySuggestion>(`/ai/conversations/${conversationId}/reply-suggestion`)
      .pipe(catchError(() => of(null)));
  }

  summarize(conversationId: string): Observable<ConversationSummary | null> {
    return this.api
      .get<ConversationSummary>(`/ai/conversations/${conversationId}/summary`)
      .pipe(catchError(() => of(null)));
  }

  sentiment(conversationId: string): Observable<SentimentInsight | null> {
    return this.api
      .get<SentimentInsight>(`/ai/conversations/${conversationId}/sentiment`)
      .pipe(catchError(() => of(null)));
  }
}
