import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  AnalyticsInsight,
  ChecklistResponse,
  EnterpriseAiService,
  ProviderRec,
  QuotationResponse,
  RuleListItem,
  RulesEvaluateResponse,
  UsageLog
} from '../../core/services/enterprise-ai.service';

type AiTab = 'quote' | 'rules' | 'checklist' | 'providers' | 'whatsapp' | 'insights' | 'usage';

@Component({
  selector: 'eas-ai',
  standalone: true,
  imports: [FormsModule, MatIconModule, PageHeaderComponent, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './ai.component.html',
  styleUrl: './ai.component.scss'
})
export class AiComponent implements OnInit {
  private readonly ai = inject(EnterpriseAiService);

  readonly tab = signal<AiTab>('quote');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly providerStatus = signal<Record<string, string> | null>(null);

  quoteMessage = 'Necesito una cotización para cinco personas al tour Acaime desde Armenia con transporte y almuerzo.';
  readonly quotation = signal<QuotationResponse | null>(null);

  ruleTour = 'ACAIME';
  rulePeople = 5;
  ruleTransport = true;
  ruleRestaurant = true;
  ruleGuides = false;
  readonly rules = signal<RuleListItem[]>([]);
  readonly ruleResult = signal<RulesEvaluateResponse | null>(null);

  checklistTour = 'ACAIME';
  readonly checklist = signal<ChecklistResponse | null>(null);

  providerTour = 'ACAIME';
  readonly providers = signal<ProviderRec[]>([]);

  whatsappText = 'Hola, quiero info del tour Acaime para el sábado, somos 5.';
  readonly whatsappReply = signal<{ reply: string; priority: string } | null>(null);

  insightsContext = '';
  readonly insights = signal<AnalyticsInsight | null>(null);

  readonly usage = signal<UsageLog[]>([]);

  readonly tabs: { key: AiTab; label: string; icon: string }[] = [
    { key: 'quote', label: 'Cotizador', icon: 'request_quote' },
    { key: 'rules', label: 'Reglas', icon: 'rule' },
    { key: 'checklist', label: 'Checklists', icon: 'checklist' },
    { key: 'providers', label: 'Proveedores', icon: 'handshake' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
    { key: 'insights', label: 'Insights', icon: 'insights' },
    { key: 'usage', label: 'Uso IA', icon: 'monitoring' }
  ];

  ngOnInit(): void {
    this.ai.status().subscribe({
      next: (s) => this.providerStatus.set(s),
      error: () => this.providerStatus.set({ status: 'UNKNOWN', provider: 'claude' })
    });
    this.loadRules();
  }

  setTab(t: AiTab): void {
    this.tab.set(t);
    this.error.set(null);
    if (t === 'usage') {
      this.loadUsage();
    }
  }

  runQuotation(): void {
    this.loading.set(true);
    this.error.set(null);
    this.ai.quotation(this.quoteMessage, true).subscribe({
      next: (r) => {
        this.quotation.set(r);
        this.loading.set(false);
      },
      error: (err) => this.fail(err)
    });
  }

  loadRules(): void {
    this.ai.listRules().subscribe({
      next: (r) => this.rules.set(r),
      error: () => this.rules.set([])
    });
  }

  evaluateRules(simulate = false): void {
    this.loading.set(true);
    this.error.set(null);
    const body = {
      tourCode: this.ruleTour,
      people: this.rulePeople,
      transport: this.ruleTransport,
      restaurant: this.ruleRestaurant,
      includesGuides: this.ruleGuides
    };
    const req = simulate ? this.ai.simulateRules(body) : this.ai.evaluateRules(body);
    req.subscribe({
      next: (r) => {
        this.ruleResult.set(r);
        this.loading.set(false);
      },
      error: (err) => this.fail(err)
    });
  }

  loadChecklist(): void {
    this.loading.set(true);
    this.error.set(null);
    this.ai.checklist(this.checklistTour).subscribe({
      next: (c) => {
        this.checklist.set(c);
        this.loading.set(false);
      },
      error: (err) => this.fail(err)
    });
  }

  loadProviders(): void {
    this.loading.set(true);
    this.error.set(null);
    this.ai.providers(this.providerTour).subscribe({
      next: (p) => {
        this.providers.set(p);
        this.loading.set(false);
      },
      error: (err) => this.fail(err)
    });
  }

  runWhatsapp(): void {
    this.loading.set(true);
    this.error.set(null);
    this.ai.whatsappAutoReply(this.whatsappText).subscribe({
      next: (r) => {
        this.whatsappReply.set(r);
        this.loading.set(false);
      },
      error: (err) => this.fail(err)
    });
  }

  runInsights(): void {
    this.loading.set(true);
    this.error.set(null);
    this.ai.insights(this.insightsContext).subscribe({
      next: (r) => {
        this.insights.set(r);
        this.loading.set(false);
      },
      error: (err) => this.fail(err)
    });
  }

  loadUsage(): void {
    this.ai.usageLogs().subscribe({
      next: (u) => this.usage.set(u),
      error: () => this.usage.set([])
    });
  }

  private fail(err: unknown): void {
    this.loading.set(false);
    const msg =
      (err as { error?: { message?: string } })?.error?.message ||
      (err as { message?: string })?.message ||
      'Error al llamar al Enterprise AI Engine';
    this.error.set(msg);
  }
}
