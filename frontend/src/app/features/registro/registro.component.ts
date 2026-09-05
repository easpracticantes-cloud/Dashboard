import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { IntegrationsService } from '../../core/services/integrations.service';
import { SeguimientoWhatsapp, SheetsDashboard } from '../../core/models/sheets-dashboard.model';

const TIPO_BASE = ['B2B', 'B2C', 'AGENCIA', 'PARTICULAR'];
const CANAL_BASE = ['RESERVAS', 'WHATSAPP', 'INSTAGRAM', 'WEB', 'EMAIL', 'TELEFONO'];
const DISC_BASE = ['N/A', 'D', 'I', 'S', 'C'];
const SEMAFORO_BASE = ['FRIO', 'TIBIO', 'CALIENTE', 'VENTA'];
const PRIORIDAD_BASE = ['ALTA', 'MEDIA', 'BAJA'];
const SI_NO = ['SI', 'NO'];
const REGISTRADA_BASE = ['AUTOBITS', 'FISICO', 'WHATSAPP', 'PENDIENTE'];
const ENCUESTA_BASE = ['SI', 'NO', 'PENDIENTE'];
const PAGE_SIZE = 20;
const EXCLUDED_HOJAS = new Set([
  'VENTAS',
  'TOQUES',
  'PAISES',
  'PAÍSES',
  'PIEZAS PUB',
  'PIEZASPUB',
  'PARAMETRIZACION B2B RENTABLES',
  'PARAMETRIZACION B2B',
  'DESPLIEGUE SEMANAL',
  'PLAN COMERCIAL',
]);

interface Draft {
  hojaOrigen: string;
  fecha: string;
  tipo: string;
  canal: string;
  cliente: string;
  celular: string;
  disc: string;
  solicitud: string;
  respuesta: string;
  semaforo: string;
  fechaCotizado: string;
  notas: string;
  proximoSeguimiento: string;
  priorizar: string;
  pendiente: string;
  asignado: string;
  fechaServicio: string;
  registrado: string;
  objecion: string;
  encuesta: string;
}

function emptyDraft(hoja = ''): Draft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    hojaOrigen: hoja,
    fecha: today,
    tipo: 'B2B',
    canal: 'RESERVAS',
    cliente: '',
    celular: '',
    disc: 'N/A',
    solicitud: '',
    respuesta: '',
    semaforo: 'TIBIO',
    fechaCotizado: '',
    notas: '',
    proximoSeguimiento: '',
    priorizar: 'ALTA',
    pendiente: 'SI',
    asignado: '',
    fechaServicio: '',
    registrado: '',
    objecion: '',
    encuesta: 'PENDIENTE',
  };
}

function fromRow(row: SeguimientoWhatsapp): Draft {
  return {
    hojaOrigen: row.hojaOrigen || '',
    fecha: (row.fecha || '').slice(0, 10),
    tipo: row.tipo || '',
    canal: row.canal || '',
    cliente: row.cliente || '',
    celular: row.celular || '',
    disc: row.disc || '',
    solicitud: row.solicitud || '',
    respuesta: row.respuesta || '',
    semaforo: row.semaforo || '',
    fechaCotizado: (row.fechaCotizado || '').slice(0, 10),
    notas: row.notas || '',
    proximoSeguimiento: (row.proximoSeguimiento || '').slice(0, 10),
    priorizar: row.priorizar || '',
    pendiente: row.pendiente || '',
    asignado: row.asignado || '',
    fechaServicio: (row.fechaServicio || '').slice(0, 10),
    registrado: row.registrado || '',
    objecion: row.objecion || '',
    encuesta: row.encuesta ? 'SI' : row.encuesta === false ? 'NO' : '',
  };
}

function digits(value: string | undefined): string {
  return (value || '').replace(/\D+/g, '');
}

@Component({
  selector: 'eas-registro',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './registro.component.html',
  styleUrl: './registro.component.scss',
})
export class RegistroComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly integrations = inject(IntegrationsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly aviso = signal('');
  readonly data = signal<SheetsDashboard | null>(null);
  readonly modo = signal<'lista' | 'nueva' | 'editar'>('lista');
  readonly draft = signal<Draft>(emptyDraft());
  readonly original = signal<SeguimientoWhatsapp | null>(null);
  readonly hojaFiltro = signal('');
  readonly fechaFiltro = signal('');
  readonly nombreFiltro = signal('');
  readonly numeroFiltro = signal('');
  readonly pagina = signal(1);
  readonly pageSize = PAGE_SIZE;

  readonly hojas = computed(() => {
    const d = this.data();
    const fromRows = (d?.seguimientoWhatsapp ?? []).map((r) => r.hojaOrigen || '').filter(Boolean);
    const fromMeta = (d?.hojas ?? []).map((h) => h.nombre);
    const fromPor = (d?.porHoja ?? []).map((h) => h.label);
    return [...new Set([...fromRows, ...fromMeta, ...fromPor])]
      .filter((n) => n && !EXCLUDED_HOJAS.has(n.toUpperCase()))
      .sort((a, b) => a.localeCompare(b, 'es'));
  });

  readonly filasFiltradas = computed(() => {
    const hoja = this.hojaFiltro();
    const fecha = this.fechaFiltro();
    const nombre = this.nombreFiltro().trim().toLowerCase();
    const numero = digits(this.numeroFiltro());
    return (this.data()?.seguimientoWhatsapp ?? []).filter((r) => {
      if (hoja && (r.hojaOrigen || '') !== hoja) return false;
      if (fecha && (r.fecha || '').slice(0, 10) !== fecha) return false;
      if (nombre && !(r.cliente || '').toLowerCase().includes(nombre)) return false;
      if (numero && !digits(r.celular).includes(numero)) return false;
      return true;
    });
  });

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.filasFiltradas().length / PAGE_SIZE))
  );

  readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));

  readonly filas = computed(() => {
    const all = this.filasFiltradas();
    const start = (this.paginaActual() - 1) * PAGE_SIZE;
    return all.slice(start, start + PAGE_SIZE);
  });

  readonly paginas = computed(() => {
    const total = this.totalPaginas();
    const current = this.paginaActual();
    const window = 5;
    let from = Math.max(1, current - Math.floor(window / 2));
    const to = Math.min(total, from + window - 1);
    from = Math.max(1, to - window + 1);
    const list: number[] = [];
    for (let i = from; i <= to; i++) list.push(i);
    return list;
  });

  readonly opcionesTipo = computed(() => this.mergeOpts(TIPO_BASE, (r) => r.tipo));
  readonly opcionesCanal = computed(() => this.mergeOpts(CANAL_BASE, (r) => r.canal));
  readonly opcionesDisc = computed(() => this.mergeOpts(DISC_BASE, (r) => r.disc));
  readonly opcionesSemaforo = computed(() => this.mergeOpts(SEMAFORO_BASE, (r) => r.semaforo));
  readonly opcionesPrioridad = computed(() => this.mergeOpts(PRIORIDAD_BASE, (r) => r.priorizar));
  readonly opcionesAsignado = computed(() => this.mergeOpts(['ANDREA'], (r) => r.asignado));
  readonly opcionesRegistrada = computed(() => this.mergeOpts(REGISTRADA_BASE, (r) => r.registrado));
  readonly opcionesSiNo = SI_NO;
  readonly opcionesEncuesta = ENCUESTA_BASE;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const term = (q.get('q') || '').trim();
      if (!term) return;
      if (/\d{6,}/.test(term)) this.numeroFiltro.set(term);
      else this.nombreFiltro.set(term);
      this.pagina.set(1);
    });
    const peek = this.dashboard.peekCachedSummary();
    if (peek) {
      this.data.set(peek);
      this.loading.set(false);
    }
    this.dashboard
      .getSheetsFull()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
          const hoja = this.draft().hojaOrigen || this.hojas()[0] || '';
          if (hoja && !this.draft().hojaOrigen) {
            this.draft.update((d) => ({ ...d, hojaOrigen: hoja }));
          }
        },
        error: () => this.loading.set(false),
      });
  }

  patch(key: keyof Draft, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  setFiltroHoja(value: string): void {
    this.hojaFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroFecha(value: string): void {
    this.fechaFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroNombre(value: string): void {
    this.nombreFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroNumero(value: string): void {
    this.numeroFiltro.set(value);
    this.pagina.set(1);
  }

  irPagina(page: number): void {
    const next = Math.min(this.totalPaginas(), Math.max(1, page));
    this.pagina.set(next);
  }

  nueva(): void {
    this.original.set(null);
    this.draft.set(emptyDraft(this.hojaFiltro() || this.hojas()[0] || ''));
    this.aviso.set('');
    this.modo.set('nueva');
  }

  editar(row: SeguimientoWhatsapp): void {
    this.original.set(row);
    this.draft.set(fromRow(row));
    this.aviso.set('');
    this.modo.set('editar');
  }

  cancelar(): void {
    this.modo.set('lista');
    this.original.set(null);
  }

  guardar(): void {
    if (this.saving()) return;
    const d = this.draft();
    if (!d.hojaOrigen) {
      this.aviso.set('Elige la hoja del Excel.');
      return;
    }
    this.saving.set(true);
    const payload: Record<string, unknown> = { ...d, cotizado: Boolean(d.fechaCotizado) };
    const orig = this.original();
    const req = orig
      ? this.integrations.updateSeguimiento({
          ...payload,
          hojaOrigen: orig.hojaOrigen || d.hojaOrigen,
          matchCelular: orig.celular,
          matchFecha: orig.fecha,
          matchCliente: orig.cliente,
        })
      : this.integrations.appendSeguimiento(payload);

    req.subscribe({
      next: (res) => this.finishSave(d, orig, res.message),
      error: () => this.finishSave(d, orig),
    });
  }

  recargar(): void {
    this.loading.set(true);
    this.dashboard.invalidateCache();
    this.dashboard.getSheetsFull(true).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private finishSave(d: Draft, orig: SeguimientoWhatsapp | null, message?: string): void {
    this.saving.set(false);
    this.applyLocal(d, orig);
    this.modo.set('lista');
    this.aviso.set(message || (orig ? 'Fila actualizada en el Excel.' : 'Fila agregada al Excel.'));
    this.dashboard.invalidateCache();
  }

  private applyLocal(d: Draft, orig: SeguimientoWhatsapp | null): void {
    const current = this.data();
    if (!current) return;
    const mapped: SeguimientoWhatsapp = {
      fecha: d.fecha,
      tipo: d.tipo,
      canal: d.canal,
      cliente: d.cliente,
      celular: d.celular,
      solicitud: d.solicitud,
      respuesta: d.respuesta,
      semaforo: d.semaforo,
      cotizado: Boolean(d.fechaCotizado),
      notas: d.notas,
      fechaServicio: d.fechaServicio,
      encuesta: d.encuesta === 'SI',
      asignado: d.asignado,
      proximoSeguimiento: d.proximoSeguimiento,
      hojaOrigen: d.hojaOrigen,
      disc: d.disc,
      priorizar: d.priorizar,
      pendiente: d.pendiente,
      objecion: d.objecion,
      registrado: d.registrado,
      fechaCotizado: d.fechaCotizado,
    };
    let list = current.seguimientoWhatsapp ?? [];
    if (orig) {
      list = list.map((r) =>
        r.celular === orig.celular &&
        (r.fecha || '').slice(0, 10) === (orig.fecha || '').slice(0, 10) &&
        (r.hojaOrigen || '') === (orig.hojaOrigen || '')
          ? { ...r, ...mapped, hojaOrigen: orig.hojaOrigen }
          : r
      );
    } else {
      list = [mapped, ...list];
    }
    this.data.set({ ...current, seguimientoWhatsapp: list });
  }

  private mergeOpts(base: string[], pick: (r: SeguimientoWhatsapp) => string | undefined): string[] {
    const extra = (this.data()?.seguimientoWhatsapp ?? [])
      .map(pick)
      .map((v) => (v || '').trim())
      .filter(Boolean);
    return [...new Set([...base, ...extra])].sort((a, b) => a.localeCompare(b, 'es'));
  }
}
