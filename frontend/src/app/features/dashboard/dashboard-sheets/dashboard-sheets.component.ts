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
import { ThemeService } from '../../../core/services/theme.service';
import {
  SeguimientoWhatsapp,
  SheetTable,
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
const SEMAFORO_COLORS: Record<string, string> = {
  FRIO: '#5B8DEF',
  TIBIO: '#E4A01A',
  CALIENTE: '#C25145',
  VENTA: '#1F7A4C',
  SIN_DATO: '#8A9690'
};
const CANAL_COLORS = ['#14261C', '#1F7A4C', '#E4A01A', '#3D9A6A', '#C25145', '#4A5560', '#5B8DEF'];
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

type Section =
  | 'resumen'
  | 'seguimientos'
  | 'ventas'
  | 'b2b'
  | 'paises'
  | 'piezas'
  | 'estadisticas'
  | 'despliegue'
  | 'plan'
  | 'hojas';

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
  readonly selectedRawSheet = signal('');
  readonly nextRefreshAt = signal<number>(Date.now() + REFRESH_MS);
  readonly nowTick = signal(Date.now());

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
    'fecha',
    'hojaOrigen',
    'cliente',
    'celular',
    'canal',
    'tipo',
    'semaforo',
    'solicitud',
    'respuesta',
    'cotizado',
    'encuesta',
    'asignado',
    'priorizar',
    'pendiente',
    'disc',
    'objecion',
    'fechaServicio',
    'proximoSeguimiento',
    'notas'
  ];
  readonly ventasColumns = [
    'fechaCot',
    'tipoCliente',
    'nombre',
    'celular',
    'servicio',
    'venta',
    'codigo',
    'fechaServicio',
    'realizado',
    'envioReserva',
    'pagoAutobits',
    'soporteDrive'
  ];

  readonly filteredRows = computed(() =>
    filterSeguimientos(this.data()?.seguimientoWhatsapp ?? [], this.filters())
  );

  readonly liveKpis = computed(() => computeKpis(this.filteredRows()));

  readonly kpiCards = computed<KpiItem[]>(() => {
    const k = this.liveKpis();
    return [
      { id: 'contactos', label: 'Total Contactos', value: k.totalContactos, icon: 'groups', accent: 'forest' },
      { id: 'ventas', label: 'Total Ventas', value: k.totalVentas, icon: 'payments', accent: 'leaf' },
      {
        id: 'conversion',
        label: 'Tasa Conversión',
        value: k.tasaConversion,
        suffix: '%',
        icon: 'trending_up',
        accent: 'amber'
      },
      { id: 'encuestas', label: 'Total Encuestas', value: k.totalConEncuesta, icon: 'rate_review', accent: 'mint' },
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
  readonly hojaOptions = computed(() =>
    uniqueSorted((this.data()?.seguimientoWhatsapp ?? []).map((r) => r.hojaOrigen || ''))
  );

  readonly porSemaforo = computed(() => aggregateBy(this.filteredRows(), (r) => r.semaforo || 'SIN_DATO'));
  readonly porCanal = computed(() => aggregateBy(this.filteredRows(), (r) => r.canal || 'SIN_DATO'));
  readonly evolucion = computed(() => buildEvolucion(this.filteredRows()));
  readonly porMes = computed(() =>
    this.evolucion().map((p) => ({ label: p.mes, value: p.seguimientos }))
  );

  readonly pieSeries = computed<ApexNonAxisChartSeries>(() => this.porSemaforo().map((x) => x.value));
  readonly pieLabels = computed(() => this.porSemaforo().map((x) => x.label));
  readonly pieColors = computed(() =>
    this.porSemaforo().map((x) => SEMAFORO_COLORS[x.label] ?? '#8A9690')
  );
  readonly hasPie = computed(() => this.pieSeries().some((v) => Number(v) > 0));

  readonly barCanalSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Contactos', data: this.porCanal().map((x) => x.value) }
  ]);
  readonly barCanalXaxis = computed<ApexXAxis>(() => ({
    categories: this.porCanal().map((x) => x.label),
    labels: { style: { colors: this.chartLabelColor(), fontFamily: FONT, fontSize: '11px' } }
  }));
  readonly hasBarCanal = computed(() => this.porCanal().some((x) => x.value > 0));

  readonly barMesSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Seguimientos', data: this.porMes().map((x) => x.value) }
  ]);
  readonly barMesXaxis = computed<ApexXAxis>(() => ({
    categories: this.porMes().map((x) => x.label),
    labels: { style: { colors: this.chartLabelColor(), fontFamily: FONT, fontSize: '11px' } }
  }));
  readonly hasBarMes = computed(() => this.porMes().some((x) => x.value > 0));

  readonly lineSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Seguimientos', data: this.evolucion().map((x) => x.seguimientos) },
    { name: 'Ventas', data: this.evolucion().map((x) => x.ventas) }
  ]);
  readonly lineXaxis = computed<ApexXAxis>(() => ({
    categories: this.evolucion().map((x) => x.mes),
    labels: { style: { colors: this.chartLabelColor(), fontFamily: FONT, fontSize: '11px' } }
  }));
  readonly hasLine = computed(() => this.evolucion().length > 0);

  readonly pieChart: ApexChart = { type: 'donut', height: 300, fontFamily: FONT, toolbar: { show: false } };
  readonly piePlot: ApexPlotOptions = {
    pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Total', fontFamily: FONT } } } }
  };
  readonly pieLegend: ApexLegend = { position: 'bottom', fontFamily: FONT };
  readonly pieTooltip = computed<ApexTooltip>(() => ({ theme: this.theme.isDark() ? 'dark' : 'light' }));

  readonly barChart: ApexChart = { type: 'bar', height: 300, fontFamily: FONT, toolbar: { show: false } };
  readonly barDataLabels: ApexDataLabels = { enabled: false };
  readonly barPlot: ApexPlotOptions = { bar: { borderRadius: 8, columnWidth: '48%', distributed: true } };
  readonly barLegend: ApexLegend = { show: false };
  readonly barColors = CANAL_COLORS;
  readonly barTooltip = computed<ApexTooltip>(() => ({ theme: this.theme.isDark() ? 'dark' : 'light' }));

  readonly lineChart: ApexChart = {
    type: 'line',
    height: 300,
    fontFamily: FONT,
    toolbar: { show: false },
    zoom: { enabled: false }
  };
  readonly lineStroke: ApexStroke = { curve: 'smooth', width: 3 };
  readonly lineDataLabels: ApexDataLabels = { enabled: false };
  readonly lineColors = ['#1F7A4C', '#E4A01A'];
  readonly lineLegend: ApexLegend = { position: 'top', fontFamily: FONT };
  readonly lineTooltip = computed<ApexTooltip>(() => ({ theme: this.theme.isDark() ? 'dark' : 'light' }));

  readonly toques = computed(() => this.data()?.toques ?? []);
  readonly b2bAgencias = computed(() => this.data()?.b2bAgencias ?? []);
  readonly b2bTabla = computed(() => this.data()?.b2bTabla ?? null);
  readonly piezas = computed(() => this.data()?.piezasPub ?? []);
  readonly ventas = computed(() => this.data()?.ventas ?? []);
  readonly estadisticas = computed(() => this.data()?.estadisticas ?? null);
  readonly despliegue = computed(() => this.data()?.despliegueSemanal ?? null);
  readonly planComercial = computed(() => this.data()?.planComercial ?? null);
  readonly cobertura = computed(() =>
    (this.data()?.hojas ?? []).map((h) => ({
      nombre: h.nombre,
      rowCount: h.rowCount,
      estado: h.estado
    }))
  );
  readonly paises = computed(() => this.data()?.paisesDetalle?.length
    ? this.data()!.paisesDetalle!
    : (this.data()?.resumenPaises ?? []).map((p) => ({ pais: p.label, codigo: '', cantidad: p.value }))
  );
  readonly maxPais = computed(() => Math.max(1, ...this.paises().map((p) => p.cantidad)));
  readonly hojas = computed(() => this.data()?.hojas ?? []);
  readonly rawSheets = computed(() => this.data()?.rawSheets ?? []);
  readonly activeRaw = computed(() => {
    const list = this.rawSheets();
    const name = this.selectedRawSheet();
    return list.find((s) => s.nombre === name) ?? list[0] ?? null;
  });
  readonly activeRawRows = computed(() => this.activeRaw()?.fullData ?? []);
  readonly countdownLabel = computed(() => {
    const ms = Math.max(0, this.nextRefreshAt() - this.nowTick());
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  readonly paisBarSeries = computed<ApexAxisChartSeries>(() => [
    { name: 'Contactos', data: this.paises().slice(0, 12).map((p) => p.cantidad) }
  ]);
  readonly paisBarXaxis = computed<ApexXAxis>(() => ({
    categories: this.paises().slice(0, 12).map((p) => p.pais),
    labels: { style: { colors: this.chartLabelColor(), fontFamily: FONT, fontSize: '11px' } }
  }));
  readonly paisBarChart: ApexChart = {
    type: 'bar',
    height: 360,
    fontFamily: FONT,
    toolbar: { show: false }
  };
  readonly paisBarPlot: ApexPlotOptions = {
    bar: { horizontal: true, borderRadius: 6, barHeight: '70%' }
  };

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

    this.load(false);

    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowTick.set(Date.now()));

    // Poll solo desde caché/PostgreSQL (nunca forceRefresh → Google)
    interval(REFRESH_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load(false, true));
  }

  ngAfterViewInit(): void {
    this.bindTableControls();
  }

  setSection(section: Section): void {
    this.activeSection.set(section);
    if (section === 'seguimientos') {
      queueMicrotask(() => this.bindTableControls());
    }
    if (section === 'hojas') {
      this.load(false, true);
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

  refresh(): void {
    this.load(true, false);
  }

  selectRawSheet(nombre: string): void {
    this.selectedRawSheet.set(nombre);
  }

  exportSeguimientos(format: 'csv' | 'xls'): void {
    const headers = [
      'Fecha', 'Hoja', 'Cliente', 'Celular', 'Canal', 'Tipo', 'Semáforo', 'Solicitud',
      'Respuesta', 'Cotizado', 'Encuesta', 'Asignado', 'Priorizar', 'Pendiente', 'Disc',
      'Objeción', 'Notas', 'Fecha servicio', 'Próximo seguimiento', 'Excelente', 'Buena', 'Regular', 'Registrado'
    ];
    const rows = this.filteredRows().map((r) => [
      r.fecha, r.hojaOrigen ?? '', r.cliente, r.celular, r.canal, r.tipo, r.semaforo,
      r.solicitud, r.respuesta, r.cotizado ? 'SI' : 'NO', r.encuesta ? 'SI' : 'NO',
      r.asignado, r.priorizar ?? '', r.pendiente ?? '', r.disc ?? '', r.objecion ?? '',
      r.notas, r.fechaServicio, r.proximoSeguimiento, r.excelente ?? '', r.buena ?? '', r.regular ?? '', r.registrado ?? ''
    ]);
    if (format === 'csv') downloadCsv('seguimientos-sheets', headers, rows);
    else downloadExcelCompatible('seguimientos-sheets', headers, rows);
  }

  exportVentas(format: 'csv' | 'xls'): void {
    const headers = [
      'Fecha cot', 'Tipo', 'Nombre', 'Celular', 'Servicio', 'Venta', 'Código',
      'Fecha servicio', 'Realizado', 'Envío reserva', 'Pago', 'Soporte'
    ];
    const rows = this.ventas().map((v) => [
      v.fechaCot, v.tipoCliente, v.nombre, v.celular, v.servicio, v.venta, v.codigo,
      v.fechaServicio, v.realizado, v.envioReserva, v.pagoAutobits, v.soporteDrive
    ]);
    if (format === 'csv') downloadCsv('ventas-sheets', headers, rows);
    else downloadExcelCompatible('ventas-sheets', headers, rows);
  }

  exportSheetTable(table: SheetTable | null | undefined, filename: string, format: 'csv' | 'xls'): void {
    if (!table?.headers?.length) return;
    if (format === 'csv') downloadCsv(filename, table.headers, table.rows);
    else downloadExcelCompatible(filename, table.headers, table.rows);
  }

  exportPaises(format: 'csv' | 'xls'): void {
    const headers = ['País', 'Código', 'Cantidad'];
    const rows = this.paises().map((p) => [p.pais, p.codigo, p.cantidad]);
    if (format === 'csv') downloadCsv('paises-sheets', headers, rows);
    else downloadExcelCompatible('paises-sheets', headers, rows);
  }

  exportB2b(format: 'csv' | 'xls'): void {
    const headers = [
      'Agencia', 'Estado', 'Contacto', 'Teléfono', 'Correo', 'Notas',
      'Cotizaciones', 'Reservas', 'Tipología', 'Ticket', 'Margen'
    ];
    const fromB2b = this.b2bAgencias().map((a) => [
      a.agencia, a.estado, a.contacto, a.telefono, a.correo, a.notas,
      a.cotizacionesAnual ?? '', a.reservasAnual ?? '', a.tipologiaRentable ?? '',
      a.ticketPromedio ?? '', a.margenNeto ?? ''
    ]);
    const fromToques = this.toques().map((t) => [t.agencia, t.medio, t.asesor, t.telefono, t.correo, '', '', '', '', '', '']);
    const rows = fromB2b.length ? fromB2b : fromToques;
    if (format === 'csv') downloadCsv('b2b-sheets', headers, rows);
    else downloadExcelCompatible('b2b-sheets', headers, rows);
  }

  exportRaw(format: 'csv' | 'xls'): void {
    const sheet = this.activeRaw();
    if (!sheet) return;
    const matrix = sheet.fullData ?? [];
    if (!matrix.length) return;
    const headers = (matrix[0] ?? []).map((c, i) => String(c ?? '').trim() || `Col ${i + 1}`);
    const rows = matrix.slice(1).map((row) => headers.map((_, i) => String(row?.[i] ?? '')));
    const name = `hoja-${sheet.nombre}`.replace(/[^\w\-]+/g, '_');
    if (format === 'csv') downloadCsv(name, headers, rows);
    else downloadExcelCompatible(name, headers, rows);
  }

  private chartLabelColor(): string {
    return this.theme.isDark() ? '#9eb0a6' : '#66707a';
  }

  private load(forceRefresh: boolean, fromAuto = false): void {
    if (forceRefresh) this.refreshing.set(true);
    else this.loading.set(true);
    this.error.set(null);

    // forceRefresh solo limpia caché Angular; el backend NO consulta Google en GET /dashboard/sheets
    if (forceRefresh) {
      this.dashboardService.invalidateCache();
    }
    const includeRaw = this.activeSection() === 'hojas';
    this.dashboardService.getSheets(false, includeRaw).subscribe({
      next: (payload) => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.nextRefreshAt.set(Date.now() + REFRESH_MS);
        if (!payload) {
          this.error.set('No se pudo obtener el dashboard de Sheets.');
          return;
        }
        this.data.set(payload);
        if (!this.selectedRawSheet() && payload.rawSheets?.length) {
          this.selectedRawSheet.set(payload.rawSheets[0].nombre);
        }
        if (!payload.success) {
          this.error.set(payload.message || 'Sheets respondió con error.');
        } else if (!payload.seguimientoWhatsapp?.length && !fromAuto) {
          this.error.set('Sheets conectado, pero no hay seguimientos tipados aún.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.error.set('Error de red al consultar el dashboard (PostgreSQL).');
      }
    });
  }
}
