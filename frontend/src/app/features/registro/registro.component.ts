import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
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

@Component({
  selector: 'eas-registro',
  standalone: true,
  imports: [DatePipe, FormsModule, MatIconModule],
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
  readonly error = signal('');
  readonly aviso = signal('');
  readonly data = signal<SheetsDashboard | null>(null);
  readonly modo = signal<'lista' | 'nueva' | 'editar'>('lista');
  readonly draft = signal<Draft>(emptyDraft());
  readonly original = signal<SeguimientoWhatsapp | null>(null);
  readonly filtro = signal('');
  readonly hojaFiltro = signal('');

  readonly hojas = computed(() => {
    const d = this.data();
    const fromRows = (d?.seguimientoWhatsapp ?? [])
      .map((r) => r.hojaOrigen || '')
      .filter(Boolean);
    const fromMeta = (d?.hojas ?? []).map((h) => h.nombre);
    const fromPor = (d?.porHoja ?? []).map((h) => h.label);
    const unique = [...new Set([...fromRows, ...fromMeta, ...fromPor])]
      .filter((n) => n && !EXCLUDED_HOJAS.has(n.toUpperCase()))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return unique;
  });

  readonly filas = computed(() => {
    const q = this.filtro().trim().toLowerCase();
    const hoja = this.hojaFiltro();
    return (this.data()?.seguimientoWhatsapp ?? []).filter((r) => {
      if (hoja && (r.hojaOrigen || '') !== hoja) return false;
      if (!q) return true;
      const blob = [
        r.cliente,
        r.celular,
        r.solicitud,
        r.respuesta,
        r.notas,
        r.asignado,
        r.tipo,
        r.canal,
        r.semaforo,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
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
      const term = q.get('q') || '';
      if (term) this.filtro.set(term);
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
        error: () => {
          this.loading.set(false);
          this.error.set('No se pudo leer el Excel.');
        },
      });
  }

  patch(key: keyof Draft, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  nueva(): void {
    this.original.set(null);
    this.draft.set(emptyDraft(this.hojaFiltro() || this.hojas()[0] || ''));
    this.error.set('');
    this.aviso.set('');
    this.modo.set('nueva');
  }

  editar(row: SeguimientoWhatsapp): void {
    this.original.set(row);
    this.draft.set(fromRow(row));
    this.error.set('');
    this.aviso.set('');
    this.modo.set('editar');
  }

  cancelar(): void {
    this.modo.set('lista');
    this.original.set(null);
    this.error.set('');
  }

  guardar(): void {
    if (this.saving()) return;
    const d = this.draft();
    if (!d.hojaOrigen) {
      this.error.set('Elige la hoja del Excel.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
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
      next: (res) => {
        this.saving.set(false);
        this.aviso.set(res.message || (orig ? 'Fila actualizada en el Excel.' : 'Fila agregada al Excel.'));
        this.applyLocal(d, orig);
        this.modo.set('lista');
        this.dashboard.invalidateCache();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.message || 'No se pudo guardar en el Excel.');
      },
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
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo recargar el Excel.');
      },
    });
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
