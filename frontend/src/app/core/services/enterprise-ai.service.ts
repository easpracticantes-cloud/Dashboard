import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface QuotationResponse {
  tour: string;
  people: number;
  date?: string;
  pickup?: string;
  transport?: boolean;
  restaurant?: boolean;
  tourName?: string;
  pricePerPerson?: number;
  transportPerPerson?: number;
  restaurantPerPerson?: number;
  subtotalTour?: number;
  subtotalTransport?: number;
  subtotalRestaurant?: number;
  total?: number;
  currency?: string;
  emailSubject?: string;
  emailBody?: string;
  quotationText?: string;
  notes?: string;
  rulesApplied?: string[];
  checklist?: { code: string; label: string; category: string; required: boolean; sortOrder: number }[];
  recommendations?: {
    code: string;
    name: string;
    category: string;
    tourCode?: string;
    notes?: string;
    priority: number;
  }[];
}

export interface RuleListItem {
  id: number;
  code: string;
  name: string;
  priority: number;
  active: boolean;
  tourCode: string;
  conditions: number;
  actions: number;
}

export interface RulesEvaluateResponse {
  appliedRuleCodes: string[];
  messages: string[];
  flags: Record<string, unknown>;
  adjustments: Record<string, unknown>;
  simulated: boolean;
}

export interface ChecklistResponse {
  tourCode: string;
  title: string;
  items: { code: string; label: string; category: string; required: boolean; sortOrder: number }[];
}

export interface ProviderRec {
  code: string;
  name: string;
  category: string;
  tourCode?: string;
  notes?: string;
  priority: number;
}

export interface UsageLog {
  id: number;
  operation: string;
  provider: string;
  endpoint: string;
  latencyMs: number;
  estimatedTokens: number;
  success: boolean;
  createdAt: string;
}

export interface AnalyticsInsight {
  summary: string;
  highlights: string[];
  risks: string[];
  opportunities: string[];
}

@Injectable({ providedIn: 'root' })
export class EnterpriseAiService {
  private readonly api = inject(ApiService);

  status(): Observable<Record<string, string>> {
    return this.api.get('/ai/status');
  }

  quotation(message: string, generateNarrative = true): Observable<QuotationResponse> {
    return this.api.post('/ai/quotation', { message, generateNarrative });
  }

  chat(message: string): Observable<{ reply: string; model: string; success: boolean }> {
    return this.api.post('/ai/chat', { message });
  }

  listRules(tourCode?: string): Observable<RuleListItem[]> {
    return this.api.get('/rules', tourCode ? { tourCode } : undefined);
  }

  evaluateRules(body: {
    tourCode?: string;
    people?: number;
    transport?: boolean;
    restaurant?: boolean;
    includesGuides?: boolean;
  }): Observable<RulesEvaluateResponse> {
    return this.api.post('/rules/evaluate', body);
  }

  simulateRules(body: {
    tourCode?: string;
    people?: number;
    transport?: boolean;
    restaurant?: boolean;
    includesGuides?: boolean;
  }): Observable<RulesEvaluateResponse> {
    return this.api.post('/rules/simulate', body);
  }

  checklist(tourCode: string): Observable<ChecklistResponse> {
    return this.api.post('/ai/checklist', { tourCode });
  }

  providers(tourCode?: string, category?: string): Observable<ProviderRec[]> {
    return this.api.post('/ai/provider-recommendation', { tourCode, category });
  }

  usageLogs(): Observable<UsageLog[]> {
    return this.api.get('/ai/usage-logs');
  }

  insights(context = ''): Observable<AnalyticsInsight> {
    return this.api.post('/ai/insights', { context });
  }

  whatsappAutoReply(text: string): Observable<{ reply: string; priority: string }> {
    return this.api.post('/ai/whatsapp/auto-reply', { text });
  }

  executeActions(body: {
    instruction: string;
    contextJson?: string;
    dryRun?: boolean;
    confirm?: boolean;
  }): Observable<ActionExecuteResponse> {
    return this.api.post('/ai/actions/execute', body);
  }

  copilot(message: string, sessionId?: string): Observable<CopilotResponse> {
    return this.api.post('/ai/copilot', { message, sessionId });
  }
}

export interface CopilotResponse {
  sessionId: string;
  reply: string;
  mode: string;
  toolsUsed: string[];
  provider: string;
  success: boolean;
  quoteDraft?: QuoteDraft | null;
}

export interface QuoteDraft {
  code?: string;
  name?: string;
  modality?: string;
  people?: number;
  unitPrice?: number;
  total?: number;
  currency?: string;
  date?: string;
  pickup?: string;
  clientName?: string;
  notes?: string;
  includes?: string;
  excludes?: string;
  reviewFlag?: boolean;
  priceScaleByPax?: Record<string, number>;
}

export interface ActionExecuteResponse {
  rationale: string;
  results: {
    tool: string;
    success: boolean;
    skipped: boolean;
    dryRun: boolean;
    message: string;
    data: Record<string, unknown>;
  }[];
  narrative: string;
  executed: boolean;
  dryRun: boolean;
  plannedTools: string[];
}
