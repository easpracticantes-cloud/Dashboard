import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ChartComponent
} from 'ng-apexcharts';
import { forkJoin } from 'rxjs';
import { AnalyticsService } from '../../core/services/analytics.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { CrmFilterStore } from '../../core/services/crm-filter.store';
import { UsersService } from '../../core/services/users.service';
import { ThemeService } from '../../core/services/theme.service';
import { AmountByKey, MonthlyPoint, OpsService } from '../../core/services/ops.service';
import { AnalyticsDto } from '../../core/models/dashboard.model';
import { AnalyticsFilter } from '../../core/models/analytics-filter.model';
import { KpiItem, mapKpiDto } from '../../core/models/kpi.model';
import { UserDto } from '../../core/models/user.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { buildYearOptions } from '../../shared/utils/year-options';

const CHART_PALETTE = ['#14261C', '#1F7A4C', '#E4A01A', '#3D9A6A', '#1A3D2C', '#C25145'];
const CHART_PALETTE_DARK = ['#4DB882', '#6FCEA0', '#EFB23A', '#3D9A6A', '#B7D0C2', '#EF857A'];
const FONT = 'Sora, sans-serif';

@Component({
  selector: 'eas-analytics',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyPipe,
    DecimalPipe,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    ChartComponent,
    PageHeaderComponent,
    KpiCardComponent,
    EmptyStateComponent
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss'
})
export class AnalyticsComponent {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly usersService = inject(UsersService);
  private readonly filterStore = inject(CrmFilterStore);
  private readonly theme = inject(ThemeService);
  private readonly ops = inject(OpsService);

  readonly loading = signal(true);
  readonly opsLoading = signal(true);
  readonly analytics = signal<AnalyticsDto>({ series: [], summary: [] });
  readonly advisors = signal<UserDto[]>([]);
  readonly filter = this.filterStore.filter;

  readonly conversionPct = signal(0);
  readonly responseLagHours = signal(0);
  readonly qualityScore = signal(0);
  readonly dailyVolume = signal<{ day: string; conversations: number }[]>([]);
  readonly channels = signal<{ key: string; count: number }[]>([]);
  readonly priorities = signal<{ key: string; count: number }[]>([]);
  readonly workload = signal<
    { userId: string; fullName: string; openConversations: number; unreadMessages: number; salesCount: number }[]
  >([]);
  readonly topClients = signal<{ clientId: string; clientName: string; total: number; sales: number }[]>([]);
  readonly salesMonthly = signal<MonthlyPoint[]>([]);
  readonly quotesMonthly = signal<MonthlyPoint[]>([]);
  readonly paymentMethods = signal<AmountByKey[]>([]);
  readonly quoteAmounts = signal<AmountByKey[]>([]);
  readonly pipeline = signal<Record<string, number>>({});
  readonly clientSources = signal<{ source: string; count: number }[]>([]);

  readonly years = buildYearOptions();
  readonly months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];
  readonly importanceOptions = ['Alta', 'Media', 'Baja', 'Urgente'];
  readonly statusOptions = [
    { value: 'OPEN', label: 'Abierta' },
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'RESOLVED', label: 'Resuelta' },
    { value: 'ARCHIVED', label: 'Archivada' }
  ];

  readonly hasData = computed(() => this.analytics().series.some((s) => s.values.some((v) => Number(v) > 0)));
  readonly summary = computed<KpiItem[]>(() => this.analytics().summary.map((kpi, index) => mapKpiDto(kpi, index)));
  readonly colors = computed(() => (this.theme.isDark() ? CHART_PALETTE_DARK : CHART_PALETTE));
  readonly labelColor = computed(() => (this.theme.isDark() ? '#9eb0a6' : '#66707a'));

  readonly areaSeries = computed<ApexAxisChartSeries>(() => {
    const s = this.analytics().series[0];
    return s ? [{ name: s.name, data: s.values }] : [];
  });
  readonly areaXaxis = computed<ApexXAxis>(() => ({
    categories: this.analytics().series[0]?.labels ?? [],
    labels: { style: { colors: this.labelColor() } },
    axisBorder: { show: false },
    axisTicks: { show: false }
  }));

  readonly statusSeries = computed<ApexNonAxisChartSeries>(() => this.analytics().series[2]?.values ?? []);
  readonly statusLabels = computed(() => this.analytics().series[2]?.labels ?? []);

  readonly importanceSeries = computed<ApexAxisChartSeries>(() => {
    const s = this.analytics().series[3];
    return s ? [{ name: s.name, data: s.values }] : [];
  });
  readonly importanceXaxis = computed<ApexXAxis>(() => ({
    categories: this.analytics().series[3]?.labels ?? [],
    labels: { style: { colors: this.labelColor() } }
  }));

  readonly categorySeries = computed<ApexNonAxisChartSeries>(() => this.analytics().series[4]?.values ?? []);
  readonly categoryLabels = computed(() => this.analytics().series[4]?.labels ?? []);

  readonly advisorSeries = computed<ApexAxisChartSeries>(() => {
    const s = this.analytics().series[5];
    return s ? [{ name: s.name, data: s.values }] : [];
  });
  readonly advisorXaxis = computed<ApexXAxis>(() => ({
    categories: this.analytics().series[5]?.labels ?? [],
    labels: { style: { colors: this.labelColor() } }
  }));
  readonly hasAdvisorData = computed(() => (this.analytics().series[5]?.values ?? []).some((v) => Number(v) > 0));

  readonly volumeSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Conversaciones', data: this.dailyVolume().map((d) => d.conversations) }
  ]);
  readonly volumeXaxis = computed<ApexXAxis>(() => ({
    categories: this.dailyVolume().map((d) => d.day),
    labels: { style: { colors: this.labelColor() }, rotate: -35, hideOverlappingLabels: true },
    axisBorder: { show: false },
    axisTicks: { show: false }
  }));
  readonly hasVolume = computed(() => this.dailyVolume().some((d) => d.conversations > 0));

  readonly channelSeries = computed<ApexNonAxisChartSeries>(() => this.channels().map((c) => Number(c.count)));
  readonly channelLabels = computed(() => this.channels().map((c) => c.key || 'Sin canal'));
  readonly hasChannels = computed(() => this.channels().some((c) => Number(c.count) > 0));

  readonly prioritySeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Conversaciones', data: this.priorities().map((p) => Number(p.count)) }
  ]);
  readonly priorityXaxis = computed<ApexXAxis>(() => ({
    categories: this.priorities().map((p) => p.key || 'Sin prioridad'),
    labels: { style: { colors: this.labelColor() } }
  }));
  readonly hasPriorities = computed(() => this.priorities().some((p) => Number(p.count) > 0));

  readonly workloadSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Abiertas', data: this.workload().map((w) => w.openConversations) },
    { name: 'No leídos', data: this.workload().map((w) => w.unreadMessages) }
  ]);
  readonly workloadXaxis = computed<ApexXAxis>(() => ({
    categories: this.workload().map((w) => w.fullName),
    labels: { style: { colors: this.labelColor() } }
  }));
  readonly hasWorkload = computed(() => this.workload().length > 0);

  private monthLabel(month: string): string {
    const [y, m] = (month ?? '').split('-');
    const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const idx = Number(m) - 1;
    return idx >= 0 && idx < 12 ? `${names[idx]} ${(y ?? '').slice(2)}` : month;
  }

  readonly monthlySeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Ventas', data: this.salesMonthly().map((p) => Number(p.amount)) },
    { name: 'Cotizaciones', data: this.quotesMonthly().map((p) => Number(p.amount)) }
  ]);
  readonly monthlyXaxis = computed<ApexXAxis>(() => ({
    categories: this.salesMonthly().map((p) => this.monthLabel(p.month)),
    labels: { style: { colors: this.labelColor() } },
    axisBorder: { show: false },
    axisTicks: { show: false }
  }));
  readonly hasMonthly = computed(() => this.salesMonthly().length > 0 || this.quotesMonthly().length > 0);

  readonly paymentSeries = computed<ApexNonAxisChartSeries>(() => this.paymentMethods().map((p) => Number(p.amount)));
  readonly paymentLabels = computed(() =>
    this.paymentMethods().map((p) => this.paymentMethodLabel(p.key))
  );
  readonly hasPayments = computed(() => this.paymentMethods().some((p) => Number(p.amount) > 0));

  readonly quoteAmountSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Monto', data: this.quoteAmounts().map((p) => Number(p.amount)) }
  ]);
  readonly quoteAmountXaxis = computed<ApexXAxis>(() => ({
    categories: this.quoteAmounts().map((p) => this.quoteStatusLabel(p.key)),
    labels: { style: { colors: this.labelColor() } }
  }));
  readonly hasQuoteAmounts = computed(() => this.quoteAmounts().some((p) => Number(p.amount) > 0 || Number(p.count) > 0));

  readonly pipelineSeries = computed<ApexAxisChartSeries>(() => {
    const p = this.pipeline();
    return [
      {
        name: 'Cantidad',
        data: [
          Number(p['quotesDraft'] ?? 0),
          Number(p['quotesSent'] ?? 0),
          Number(p['quotesAccepted'] ?? 0),
          Number(p['reservations'] ?? 0),
          Number(p['sales'] ?? 0)
        ]
      }
    ];
  });
  readonly pipelineXaxis = computed<ApexXAxis>(() => ({
    categories: ['Borrador', 'Enviadas', 'Aceptadas', 'Reservas', 'Ventas'],
    labels: { style: { colors: this.labelColor() } }
  }));
  readonly hasPipeline = computed(() => {
    const p = this.pipeline();
    return Object.values(p).some((v) => Number(v) > 0);
  });

  readonly sourceSeries = computed<ApexNonAxisChartSeries>(() => this.clientSources().map((s) => Number(s.count)));
  readonly sourceLabels = computed(() => this.clientSources().map((s) => s.source || 'Sin origen'));
  readonly hasSources = computed(() => this.clientSources().some((s) => Number(s.count) > 0));

  quoteStatusLabel(key: string): string {
    return (
      {
        DRAFT: 'Borrador',
        SENT: 'Enviada',
        ACCEPTED: 'Aceptada',
        REJECTED: 'Rechazada',
        CANCELLED: 'Cancelada'
      } as Record<string, string>
    )[(key ?? '').toUpperCase()] ?? (key || 'Otro');
  }

  paymentMethodLabel(key: string): string {
    return (
      {
        CASH: 'Efectivo',
        CARD: 'Tarjeta',
        TRANSFER: 'Transferencia',
        NEQUI: 'Nequi',
        DAVIPLATA: 'Daviplata',
        OTHER: 'Otro'
      } as Record<string, string>
    )[(key ?? '').toUpperCase()] ?? (key || 'Sin método');
  }

  readonly areaChart: ApexChart = { type: 'area', height: 320, toolbar: { show: false }, fontFamily: FONT };
  readonly barChart: ApexChart = { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: FONT };
  readonly rankingBarChart: ApexChart = { type: 'bar', height: 300, toolbar: { show: false }, fontFamily: FONT };
  readonly rankingPlotOptions: ApexPlotOptions = { bar: { horizontal: true, borderRadius: 4 } };
  readonly donutChart: ApexChart = { type: 'donut', height: 300, fontFamily: FONT };
  readonly areaStroke: ApexStroke = { curve: 'smooth', width: 3 };
  readonly areaFill: ApexFill = {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 90, 100] }
  };
  readonly areaDataLabels: ApexDataLabels = { enabled: false };
  readonly areaGrid = computed<ApexGrid>(() => ({
    borderColor: this.theme.isDark() ? 'rgba(238,244,240,0.08)' : 'rgba(20,38,28,0.08)',
    strokeDashArray: 4
  }));
  readonly areaLegend: ApexLegend = { show: false };
  readonly stackedLegend: ApexLegend = { position: 'top', fontFamily: FONT };
  readonly areaTooltip = computed<ApexTooltip>(() => ({ theme: this.theme.isDark() ? 'dark' : 'light' }));
  readonly areaYaxis = computed<ApexYAxis>(() => ({
    labels: { style: { colors: this.labelColor() } },
    min: 0
  }));
  readonly donutLegend: ApexLegend = { position: 'bottom', fontFamily: FONT };
  readonly donutPlotOptions: ApexPlotOptions = {
    pie: { donut: { labels: { show: true, total: { show: true, label: 'Total' } } } }
  };
  readonly stackedBarChart: ApexChart = {
    type: 'bar',
    height: 300,
    stacked: true,
    toolbar: { show: false },
    fontFamily: FONT
  };

  readonly fromDate = signal<Date | null>(null);
  readonly toDate = signal<Date | null>(null);

  constructor() {
    effect(() => {
      this.liveSync.tick();
      this.reload();
      this.reloadOpsInsights();
    });
    this.usersService.list().subscribe((users) => this.advisors.set(users));
  }

  patchFilter(partial: Partial<AnalyticsFilter>): void {
    this.filterStore.patch(partial);
    this.reload();
  }

  onFromChange(date: Date | null): void {
    this.fromDate.set(date);
    this.patchFilter({ from: date ? this.toIso(date) : null });
  }

  onToChange(date: Date | null): void {
    this.toDate.set(date);
    this.patchFilter({ to: date ? this.toIso(date) : null });
  }

  clearFilters(): void {
    this.filterStore.clear();
    this.fromDate.set(null);
    this.toDate.set(null);
    this.reload();
  }

  exportAdvisorCsv(): void {
    this.ops.exportAdvisorPerformanceCsv().subscribe((blob) => {
      if (blob) {
        this.ops.downloadBlob(blob, 'desempeno-asesores.csv');
      }
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.analyticsService.getAnalytics(this.filterStore.filter()).subscribe((data) => {
      this.analytics.set(data);
      this.loading.set(false);
    });
  }

  private reloadOpsInsights(): void {
    this.opsLoading.set(true);
    forkJoin({
      conversion: this.ops.getConversionQuoteSale(),
      lag: this.ops.getResponseLag(),
      quality: this.ops.getDataQuality(),
      volume: this.ops.getDailyVolume(30),
      channels: this.ops.getChannelsInsight(),
      priorities: this.ops.getPrioritiesInsight(),
      workload: this.ops.getAdvisorWorkload(),
      topClients: this.ops.getTopClients(8),
      salesMonthly: this.ops.getSalesMonthlySeries(6),
      quotesMonthly: this.ops.getQuotesMonthlySeries(6),
      paymentMethods: this.ops.getRevenueByPaymentMethod(),
      quoteAmounts: this.ops.getQuoteAmountsByStatus(),
      pipeline: this.ops.getCommercialPipeline(),
      clientSources: this.ops.getClientsBySource()
    }).subscribe({
      next: (r) => {
        this.conversionPct.set(Number(r.conversion?.ratePct ?? 0));
        this.responseLagHours.set(Number(r.lag?.avgHoursBetweenCreateAndLastMessage ?? 0));
        this.qualityScore.set(Number(r.quality?.['score'] ?? 0));
        this.dailyVolume.set(r.volume ?? []);
        this.channels.set(r.channels ?? []);
        this.priorities.set(r.priorities ?? []);
        this.workload.set(r.workload ?? []);
        this.topClients.set(r.topClients ?? []);
        this.salesMonthly.set(r.salesMonthly ?? []);
        this.quotesMonthly.set(r.quotesMonthly ?? []);
        this.paymentMethods.set(r.paymentMethods ?? []);
        this.quoteAmounts.set(r.quoteAmounts ?? []);
        this.pipeline.set(r.pipeline ?? {});
        this.clientSources.set(r.clientSources ?? []);
        this.opsLoading.set(false);
      },
      error: () => this.opsLoading.set(false)
    });
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
