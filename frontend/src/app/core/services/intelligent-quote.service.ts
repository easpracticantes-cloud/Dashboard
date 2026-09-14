import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { QuoteDraft } from './enterprise-ai.service';

export interface IntelligentMissingInfo {
  field: string;
  severity: string;
  message: string;
}

export interface IntelligentFieldTrace {
  field: string;
  source: string;
  confidence: string;
  evidence: string;
}

export interface IntelligentQuoteResponse {
  id: string;
  status: string;
  document: QuoteDraft;
  missingInformation: IntelligentMissingInfo[];
  warnings: string[];
  confidence: string;
  trace: IntelligentFieldTrace[];
  alternativeMatches?: Array<{
    code: string;
    name: string;
    modality?: string;
    unitPrice?: number;
    people?: number;
  }>;
  stageMessage?: string;
}

export interface CreateIntelligentQuoteRequest {
  clientId?: string | null;
  instructions: string;
  advisorName?: string;
  serviceDate?: string;
  validUntil?: string;
  clientNameOverride?: string;
  clientDocumentOverride?: string;
  clientPhoneOverride?: string;
  clientEmailOverride?: string;
  clientCityOverride?: string;
  clientAddressOverride?: string;
  preferredServiceHints?: string[];
}

export interface ApproveIntelligentQuoteResponse {
  intelligentQuoteId: string;
  commercialQuoteId: string;
  quoteCode: string;
  document: QuoteDraft;
}

@Injectable({ providedIn: 'root' })
export class IntelligentQuoteService {
  private readonly api = inject(ApiService);

  create(body: CreateIntelligentQuoteRequest): Observable<IntelligentQuoteResponse> {
    return this.api.post('/ai/intelligent-quotes', body);
  }

  get(id: string): Observable<IntelligentQuoteResponse> {
    return this.api.get(`/ai/intelligent-quotes/${id}`);
  }

  recalculate(id: string, document: QuoteDraft): Observable<IntelligentQuoteResponse> {
    return this.api.post(`/ai/intelligent-quotes/${id}/recalculate`, { document });
  }

  approve(
    id: string,
    body: { document: QuoteDraft; clientId: string; advisorId?: string | null }
  ): Observable<ApproveIntelligentQuoteResponse> {
    return this.api.post(`/ai/intelligent-quotes/${id}/approve`, body);
  }
}
