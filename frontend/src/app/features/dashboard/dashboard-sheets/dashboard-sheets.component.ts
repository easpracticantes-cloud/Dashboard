import { DatePipe, DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ViewChild,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ChartComponent
} from 'ng-apexcharts';
import { interval } from 'rxjs';
import { DashboardService } from '../../../core/services/dashboard.service';
import { IntegrationsService } from '../../../core/services/integrations.service';
import { ThemeService } from '../../../core/services/theme.service';
import {
  SeguimientoWhatsapp,
  SheetsDashboard,
  SheetsFilters,
  VentaSheet
} from '../../../core/models/sheets-dashboard.model';
import { KpiItem } from '../../../core/models/kpi.model';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { downloadCsv, downloadExcelCompatible } from '../../../shared/utils/export-table.util';
import {
  aggregateBy,
  buildEvolucion,
  computeKpis,
  emptyFilters,
  filterSeguimientos,
  uniqueSorted
} from './sheets-analytics.util';

const FONT = 'Sora, sans-serif';
const REFRESH_MS = 8 * 60 * 1000;
const SEMAFORO_OPTIONS = ['FRIO', 'TIBIO', 'CALIENTE', 'VENTA', 'SIN_DATO'];
const SEMAFORO_COLORS: Record<string, string> = {
  FRIO: '#5B8DEF',
  TIBIO: '#E4A01A',
  CALIENTE: '#C25145',
  VENTA: '#1F7A4C',
  SIN_DATO: '#8A9690'
};
const MONTH_LABELS = [
  { value: '01', label: 'Ene' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Ago' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dic' }
];

type Section = 'resumen' | 'seguimientos' | 'ventas';

@Component({
  selector: 'eas-dashboard-sheets',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    ChartComponent,
    KpiCardComponent,
    EmptyStateComponent
  ],
  templateUrl: './dashboard-sheets.component.html',
  styleUrl: './dashboard-sheets.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DashboardSheetsComponent implements AfterViewInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly integrations = inject(IntegrationsService);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild(MatSort) sort?: MatSort;
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<SheetsDashboard | null>(null);
  readonly filters = signal<SheetsFilters>(emptyFilters());
  readonly activeSection = signal<Section>('resumen');

  readonly editingSeguimiento = signal<SeguimientoWhatsapp | null>(null);
  readonly editingVenta = signal<VentaSheet | null>(null);
  readonly editDraft = signal<Record<string, unknown>>({});
  readonly savingEdit = signal(false);
  readonly editError = signal<string | null>(null);
  readonly editSuccess = signal<string | null>(null);
  readonly semaforoChoices = SEMAFORO_OPTIONS;

  readonly months = MONTH_LABELS;
  readonly years = computed(() => {
    const current = new Date().getFullYear();
    const fromData = (this.data()?.seguimientoWhatsapp ?? [])
      .map((r) => Number((r.fecha || '').slice(0, 4)))
      .filter((y) => Number.isFinite(y) && y >= 2025 && y <= current + 2);
    const minYear = fromData.length ? Math.min(...fromData) : 2025;
    const maxYear = fromData.length ? Math.max(...fromData, current) : Math.max(current, 2026);
    const years: string[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) {
      years.push(String(y));
    }
    return years;
  });

  readonly table = new MatTableDataSource<SeguimientoWhatsapp>([]);
  readonly ventasTable = new MatTableDataSource<VentaSheet>([]);
  readonly displayedColumns = [
    'acciones',
    'fecha',
    'cliente',
    'celular',
    'canal',
    'semaforo',
    'solicitud',
    'asignado',
    'proximoSeguimiento',
    'notas'
  ];
  readonly ventasColumns = [
    'acciones',
    'fechaCot',
    'nombre',
    'celular',
    'servicio',
    'venta',
    'fechaServicio',
    'realizado',
    'pagoAutobits'
  ];

  readonly filteredRows = computed(() =>
    filterSeguimientos(this.data()?.seguimientoWhatsapp ?? [], this.filters())
  );

  readonly liveKpis = computed(() => computeKpis(this.filteredRows()));

  readonly kpiCards = computed<KpiItem[]>(() => {
    const k = this.liveKpis();
    return [
      { id: 'contactos', label: 'Contactos', value: k.totalContactos, icon: 'groups', accent: 'forest' },
      { id: 'ventas', label: 'Ventas', value: k.totalVentas, icon: 'payments', accent: 'leaf' },
      {
        id: 'conversion',
        label: 'Conversión',
        value: k.tasaConversion,
        suffix: '%',
        icon: 'trending_up',
        accent: 'amber'
      },
      {
        id: 'tibio',
        label: 'Tibio + Caliente',
        value: k.totalTibioCaliente,
        icon: 'local_fire_department',
        accent: 'danger'
      }
    ];
  });

  readonly semaforoOptions = computed(() =>
    uniqueSorted((this.data()?.seguimientoWhatsapp ?? []).map((r) => r.semaforo || 'SIN_DATO'))
  );
  readonly canalOptions = computed(() =>
    uniqueSorted((this.data()?.seguimientoWhatsapp ?? []).map((r) => r.canal || 'SIN_DATO'))
  );

  readonly porSemaforo = computed(() => aggregateBy(this.filteredRows(), (r) => r.semaforo || 'SIN_DATO'));
  readonly evolucion = computed(() => buildEvolucion(this.filteredRows()));

  readonly pieSeries = computed<ApexNonAxisChartSeries>(() => this.porSemaforo().map((x) => x.value));
  readonly pieLabels = computed(() => this.porSemaforo().map((x) => x.label));
  readonly pieColors = computed(() =>
    this.porSemaforo().map((x) => SEMAFORO_COLORS[x.label] ?? '#8A9690')
  );
  readonly hasPie = computed(() => this.pieSeries().some((v) => Number(v) > 0));

  readonly lineSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Seguimientos', data: this.evolucion().map((x) => x.seguimientos) },
    { name: 'Ventas', data: this.evolucion().map((x) => x.ventas) }
  ]);
  readonly lineXaxis = computed<ApexXAxis>(() => ({
    categories: this.evolucion().map((x) => x.mes),
    labels: { style: { colors: this.chartLabelColor(), fontFamily: FONT, fontSize: '11px' } }
  }));
  readonly hasLine = computed(() => this.evolucion().length > 0);

  readonly pieChart: ApexChart = { type: 'donut', height: 280, fontFamily: FONT, toolbar: { show: false } };
  readonly piePlot: ApexPlotOptions = {
    pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Total', fontFamily: FONT } } } }
  };
  readonly pieLegend: ApexLegend = { position: 'bottom', fontFamily: FONT };
  readonly pieTooltip = computed<ApexTooltip>(() => ({ theme: this.theme.isDark() ? 'dark' : 'light' }));

  readonly lineChart: ApexChart = {
    type: 'line',
    height: 280,
    fontFamily: FONT,
    toolbar: { show: false },
    zoom: { enabled: false }
  };
  readonly lineStroke: ApexStroke = { curve: 'smooth', width: 3 };
  readonly lineDataLabels: ApexDataLabels = { enabled: false };
  readonly lineColors = ['#1F7A4C', '#E4A01A'];
  readonly lineLegend: ApexLegend = { position: 'top', fontFamily: FONT };
  readonly lineTooltip = computed<ApexTooltip>(() => ({ theme: this.theme.isDark() ? 'dark' : 'light' }));

  readonly ventas = computed(() => this.data()?.ventas ?? []);

  constructor() {
    this.table.sortingDataAccessor = (item, column) => {
      const value = (item as unknown as Record<string, unknown>)[column];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value == null ? '' : String(value).toLowerCase();
    };

    effect(() => {
      this.table.data = this.filteredRows();
    });
    effect(() => {
      this.ventasTable.data = this.ventas();
    });

    const cached = this.dashboardService.peekCachedSummary();
    if (cached?.success) {
      this.data.set(cached);
      this.loading.set(false);
    }

    this.loadProgressive(false);

    interval(REFRESH_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadProgressive(true));
  }

  ngAfterViewInit(): void {
    this.bindTableControls();
  }

  setSection(section: Section): void {
    this.activeSection.set(section);
    if (section === 'seguimientos' || section === 'ventas') {
      this.ensureFullPayload();
      queueMicrotask(() => this.bindTableControls());
    }
  }

  private bindTableControls(): void {
    if (this.sort) this.table.sort = this.sort;
    if (this.paginator) this.table.paginator = this.paginator;
  }

  patchFilter<K extends keyof SheetsFilters>(key: K, value: SheetsFilters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    if (this.paginator) this.paginator.firstPage();
  }

  clearFilters(): void {
    this.filters.set(emptyFilters());
    if (this.paginator) this.paginator.firstPage();
  }

  openSeguimientoEditor(row: SeguimientoWhatsapp): void {
    this.editingVenta.set(null);
    this.editError.set(null);
    this.editSuccess.set(null);
    this.editingSeguimiento.set(row);
    this.editDraft.set({
      fecha: row.fecha ?? '',
      tipo: row.tipo ?? '',
      canal: row.canal ?? '',
      cliente: row.cliente ?? '',
      celular: row.celular ?? '',
      solicitud: row.solicitud ?? '',
      respuesta: row.respuesta ?? '',
      semaforo: row.semaforo ?? '',
      cotizado: !!row.cotizado,
      notas: row.notas ?? '',
      fechaServicio: row.fechaServicio ?? '',
      encuesta: !!row.encuesta,
      asignado: row.asignado ?? '',
      proximoSeguimiento: row.proximoSeguimiento ?? '',
      hojaOrigen: row.hojaOrigen ?? '',
      disc: row.disc ?? '',
      priorizar: row.priorizar ?? '',
      pendiente: row.pendiente ?? '',
      objecion: row.objecion ?? '',
      excelente: row.excelente ?? '',
      buena: row.buena ?? '',
      regular: row.regular ?? '',
      registrado: row.registrado ?? '',
      fechaCotizado: row.fechaCotizado ?? '',
      monto: row.monto ?? ''
    });
  }

  openVentaEditor(row: VentaSheet): void {
    this.editingSeguimiento.set(null);
    this.editError.set(null);
    this.editSuccess.set(null);
    this.editingVenta.set(row);
    this.editDraft.set({
      fechaCot: row.fechaCot ?? '',
      tipoCliente: row.tipoCliente ?? '',
      nombre: row.nombre ?? '',
      celular: row.celular ?? '',
      servicio: row.servicio ?? '',
      venta: row.venta ?? '',
      codigo: row.codigo ?? '',
      fechaServicio: row.fechaServicio ?? '',
      realizado: row.realizado ?? '',
      envioReserva: row.envioReserva ?? '',
      pagoAutobits: row.pagoAutobits ?? '',
      soporteDrive: row.soporteDrive ?? '',
      hojaOrigen: row.hojaOrigen ?? 'VENTAS'
    });
  }

  closeEditor(): void {
    this.editingSeguimiento.set(null);
    this.editingVenta.set(null);
    this.editDraft.set({});
    this.editError.set(null);
    this.savingEdit.set(false);
  }

  patchDraft(key: string, value: unknown): void {
    this.editDraft.update((d) => ({ ...d, [key]: value }));
  }

  saveEditor(): void {
    if (this.savingEdit()) return;
    this.editError.set(null);
    this.editSuccess.set(null);
    this.savingEdit.set(true);
    const draft = this.editDraft();

    const originalSeg = this.editingSeguimiento();
    if (originalSeg) {
      this.integrations
        .updateSeguimiento({
          ...draft,
          hojaOrigen: originalSeg.hojaOrigen,
          matchCelular: originalSeg.celular,
          matchFecha: originalSeg.fecha,
          matchCliente: originalSeg.cliente
        })
        .subscribe({
          next: (res) => {
            this.savingEdit.set(false);
            this.applySeguimientoLocal(draft as unknown as SeguimientoWhatsapp, originalSeg);
            this.editSuccess.set(res.message || 'Guardado en Google Sheets');
            setTimeout(() => this.closeEditor(), 700);
          },
          error: (err) => {
            this.savingEdit.set(false);
            this.editError.set(err?.message || 'No se pudo guardar en Google Sheets');
          }
        });
      return;
    }

    const originalVenta = this.editingVenta();
    if (originalVenta) {
      this.integrations
        .updateVenta({
          ...draft,
          hojaOrigen: originalVenta.hojaOrigen || 'VENTAS',
          matchCelular: originalVenta.celular,
          matchFecha: originalVenta.fechaCot,
          matchNombre: originalVenta.nombre
        })
        .subscribe({
          next: (res) => {
            this.savingEdit.set(false);
            this.applyVentaLocal(draft as unknown as VentaSheet, originalVenta);
            this.editSuccess.set(res.message || 'Venta guardada en Google Sheets');
            setTimeout(() => this.closeEditor(), 700);
          },
          error: (err) => {
            this.savingEdit.set(false);
            this.editError.set(err?.message || 'No se pudo guardar la venta en Google Sheets');
          }
        });
    }
  }

  private applySeguimientoLocal(updated: SeguimientoWhatsapp, original: SeguimientoWhatsapp): void {
    const current = this.data();
    if (!current?.seguimientoWhatsapp) return;
    const list = current.seguimientoWhatsapp.map((r) => {
      const sameCel = (r.celular || '') === (original.celular || '');
      const sameFecha = (r.fecha || '').slice(0, 10) === (original.fecha || '').slice(0, 10);
      const sameHoja = (r.hojaOrigen || '') === (original.hojaOrigen || '');
      return sameCel && sameFecha && sameHoja ? { ...r, ...updated, hojaOrigen: original.hojaOrigen } : r;
    });
    this.data.set({ ...current, seguimientoWhatsapp: list });
    this.dashboardService.invalidateCache();
  }

  private applyVentaLocal(updated: VentaSheet, original: VentaSheet): void {
    const current = this.data();
    if (!current?.ventas) return;
    const list = current.ventas.map((r) => {
      const sameCel = (r.celular || '') === (original.celular || '');
      const sameFecha = (r.fechaCot || '').slice(0, 10) === (original.fechaCot || '').slice(0, 10);
      return sameCel && sameFecha ? { ...r, ...updated, hojaOrigen: original.hojaOrigen } : r;
    });
    this.data.set({ ...current, ventas: list });
    this.dashboardService.invalidateCache();
  }

  refresh(): void {
    this.loadProgressive(true);
  }

  exportSeguimientos(format: 'csv' | 'xls'): void {
    const headers = [
      'Fecha',
      'Hoja',
      'Cliente',
      'Celular',
      'Canal',
      'Tipo',
      'Semáforo',
      'Solicitud',
      'Respuesta',
      'Cotizado',
      'Encuesta',
      'Asignado',
      'Priorizar',
      'Pendiente',
      'Disc',
      'Objeción',
      'Notas',
      'Fecha servicio',
      'Próximo seguimiento',
      'Excelente',
      'Buena',
      'Regular',
      'Registrado',
      'Fecha cotizado',
      'Monto'
    ];
    const rows = this.filteredRows().map((r) => [
      r.fecha,
      r.hojaOrigen ?? '',
      r.cliente,
      r.celular,
      r.canal,
      r.tipo,
      r.semaforo,
      r.solicitud,
      r.respuesta,
      r.cotizado ? 'SI' : 'NO',
      r.encuesta ? 'SI' : 'NO',
      r.asignado,
      r.priorizar ?? '',
      r.pendiente ?? '',
      r.disc ?? '',
      r.objecion ?? '',
      r.notas,
      r.fechaServicio,
      r.proximoSeguimiento,
      r.excelente ?? '',
      r.buena ?? '',
      r.regular ?? '',
      r.registrado ?? '',
      r.fechaCotizado ?? '',
      r.monto ?? ''
    ]);
    if (format === 'csv') downloadCsv('seguimientos-sheets', headers, rows);
    else downloadExcelCompatible('seguimientos-sheets', headers, rows);
  }

  exportVentas(format: 'csv' | 'xls'): void {
    const headers = [
      'Fecha cot',
      'Tipo',
      'Nombre',
      'Celular',
      'Servicio',
      'Venta',
      'Código',
      'Fecha servicio',
      'Realizado',
      'Envío reserva',
      'Pago',
      'Soporte'
    ];
    const rows = this.ventas().map((v) => [
      v.fechaCot,
      v.tipoCliente,
      v.nombre,
      v.celular,
      v.servicio,
      v.venta,
      v.codigo,
      v.fechaServicio,
      v.realizado,
      v.envioReserva,
      v.pagoAutobits,
      v.soporteDrive
    ]);
    if (format === 'csv') downloadCsv('ventas-sheets', headers, rows);
    else downloadExcelCompatible('ventas-sheets', headers, rows);
  }

  private chartLabelColor(): string {
    return this.theme.isDark() ? '#9eb0a6' : '#66707a';
  }

  private loadProgressive(force: boolean): void {
    if (!this.data() && !force) {
      this.loading.set(true);
    }
    if (force) {
      this.refreshing.set(true);
      this.dashboardService.invalidateCache();
    }
    this.error.set(null);

    this.dashboardService.getSheetsSummary(force).subscribe({
      next: (payload) => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (!payload) {
          if (!this.data()) {
            this.error.set('No se pudo obtener el dashboard.');
          }
          return;
        }
        const current = this.data();
        if (current?.seguimientoWhatsapp?.length) {
          this.data.set({
            ...current,
            ...payload,
            seguimientoWhatsapp: current.seguimientoWhatsapp,
            ventas: current.ventas
          });
        } else {
          this.data.set(payload);
        }
        if (!payload.success) {
          this.error.set(payload.message || 'Dashboard aún sincronizando.');
        }
        const hydrate = () => this.ensureFullPayload();
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => hydrate(), { timeout: 2000 });
        } else {
          setTimeout(hydrate, 400);
        }
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (!this.data()) {
          this.error.set('Error de red al consultar el dashboard (PostgreSQL).');
        }
      }
    });
  }

  private ensureFullPayload(): void {
    const current = this.data();
    if (current?.seguimientoWhatsapp?.length) {
      return;
    }
    this.dashboardService.getSheetsFull(false).subscribe({
      next: (full) => {
        if (!full) return;
        this.data.set(full);
      }
    });
  }
}
