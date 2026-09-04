import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';

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
  model?: string;
  modelTier?: string;
  latencyMs: number;
  estimatedTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
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
  private readonly appConfig = inject(AppConfigService);
  private readonly auth = inject(AuthService);

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

  /**
   * Streaming SSE de Ave. Usa fetch (Authorization header) porque EventSource no lo permite.
   */
  async copilotStream(
    message: string,
    sessionId: string | undefined,
    handlers: {
      signal?: AbortSignal;
      onDelta: (chunk: string) => void;
      onDone: (res: CopilotResponse) => void;
      onError: (message: string) => void;
    }
  ): Promise<void> {
    const token = this.auth.token();
    const url = `${this.appConfig.apiBaseUrl}/ai/copilot/stream`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ message, sessionId }),
      signal: handlers.signal
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw Object.assign(new Error(text || res.statusText), { status: res.status });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (eventName === 'delta') {
            // Spring may JSON-encode strings
            try {
              handlers.onDelta(JSON.parse(data));
            } catch {
              handlers.onDelta(data);
            }
          } else if (eventName === 'done') {
            handlers.onDone(JSON.parse(data) as CopilotResponse);
          } else if (eventName === 'error') {
            try {
              const obj = JSON.parse(data) as { message?: string };
              handlers.onError(obj.message || 'Error desconocido');
            } catch {
              handlers.onError(data);
            }
          }
          eventName = 'message';
        } else if (line.trim() === '') {
          eventName = 'message';
        }
      }
    }
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
