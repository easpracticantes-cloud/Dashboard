import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { IntegrationsService } from '../../core/services/integrations.service';
import {
  WhatsappAnalyzeError,
  WhatsappPreview,
  WhatsappRegistroApiService,
} from '../../core/services/whatsapp-registro-api.service';
import { SeguimientoWhatsapp, SheetsDashboard } from '../../core/models/sheets-dashboard.model';
import { AveUiContextService } from '../../shared/components/ave-copilot/ave-ui-context.service';
import {
  formatContactFecha,
  formatSheetDate,
  sheetCalendarDate,
  sheetContactFecha,
  sheetDateKey,
} from '../../core/utils/sheet-date';

const TIPO_BASE = ['B2B', 'B2C', 'AGENCIA', 'PARTICULAR'];
const CANAL_BASE = ['RESERVAS', 'WHATSAPP', 'INSTAGRAM', 'WEB', 'EMAIL', 'TELEFONO'];
const DISC_OPTIONS = [
  { value: 'N/A', label: 'N/A', tone: 'na' },
  { value: 'D', label: 'Rojo (dominante)', tone: 'rojo' },
  { value: 'I', label: 'Amarillo (influencia)', tone: 'amarillo' },
  { value: 'S', label: 'Verde (estabilidad)', tone: 'verde' },
  { value: 'C', label: 'Azul (cumplimiento)', tone: 'azul' },
] as const;
const SEMAFORO_BASE = ['FRIO', 'TIBIO', 'CALIENTE', 'VENTA'];
const PRIORIDAD_BASE = ['ALTA', 'MEDIA', 'BAJA'];
const SI_NO = ['SI', 'NO'];
const REGISTRADA_BASE = ['AUTOBITS', 'FISICO', 'WHATSAPP', 'PENDIENTE'];
const ENCUESTA_BASE = ['SI', 'NO', 'PENDIENTE'];
const PAGE_SIZE = 20;
const MAX_WA_FILES = 50;
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
    fecha: sheetContactFecha(row.fecha),
    tipo: row.tipo || '',
    canal: row.canal || '',
    cliente: row.cliente || '',
    celular: row.celular || '',
    disc: normalizeDisc(row.disc),
    solicitud: row.solicitud || '',
    respuesta: row.respuesta || '',
    semaforo: row.semaforo || '',
    fechaCotizado: sheetCalendarOrEmpty(row.fechaCotizado),
    notas: row.notas || '',
    proximoSeguimiento: sheetCalendarDate(row.proximoSeguimiento),
    priorizar: row.priorizar || '',
    pendiente: row.pendiente || '',
    asignado: row.asignado || '',
    fechaServicio: sheetCalendarOrEmpty(row.fechaServicio),
    registrado: row.registrado || '',
    objecion: row.objecion || '',
    encuesta: row.encuesta ? 'SI' : row.encuesta === false ? 'NO' : '',
  };
}

function digits(value: string | undefined): string {
  return (value || '').replace(/\D+/g, '');
}

function sheetCalendarOrEmpty(raw?: string | null): string {
  return sheetCalendarDate(raw);
}

function encuestaKey(raw: unknown): string {
  if (raw === true || raw === 'SI' || raw === 'true') return 'SI';
  if (raw === false || raw === 'NO' || raw === 'false') return 'NO';
  const t = String(raw || '')
    .trim()
    .toUpperCase();
  return t || 'PENDIENTE';
}

function normalizeDisc(raw?: string | null): string {
  const t = (raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!t) return 'N/A';
  if (['D', 'ROJO', 'RED', 'DOMINANCIA', 'DOMINANTE'].includes(t)) return 'D';
  if (['I', 'AMARILLO', 'YELLOW', 'INFLUENCIA'].includes(t)) return 'I';
  if (['S', 'VERDE', 'GREEN', 'ESTABILIDAD', 'ESTABLE'].includes(t)) return 'S';
  if (['C', 'AZUL', 'BLUE', 'CUMPLIMIENTO'].includes(t)) return 'C';
  return 'N/A';
}

function discLabel(raw?: string | null): string {
  const value = normalizeDisc(raw);
  return DISC_OPTIONS.find((o) => o.value === value)?.label || 'N/A';
}

function discTone(raw?: string | null): string {
  const value = normalizeDisc(raw);
  return DISC_OPTIONS.find((o) => o.value === value)?.tone || 'na';
}

@Component({
  selector: 'eas-registro',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  templateUrl: './registro.component.html',
  styleUrl: './registro.component.scss',
})
export class RegistroComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly integrations = inject(IntegrationsService);
  private readonly whatsappApi = inject(WhatsappRegistroApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly aveUi = inject(AveUiContextService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly aviso = signal('');
  readonly data = signal<SheetsDashboard | null>(null);
  readonly modo = signal<'lista' | 'nueva' | 'editar'>('lista');
  readonly draft = signal<Draft>(emptyDraft());
  readonly original = signal<SeguimientoWhatsapp | null>(null);
  readonly hojaFiltro = signal('');
  readonly fechaFiltro = signal('');
  readonly mesFiltro = signal('');
  readonly tipoFiltro = signal('');
  readonly semaforoFiltro = signal('');
  readonly proxSeguimientoFiltro = signal('');
  readonly prioridadFiltro = signal('');
  readonly pendienteFiltro = signal('');
  readonly encuestaFiltro = signal('');
  readonly nombreFiltro = signal('');
  readonly numeroFiltro = signal('');
  readonly pagina = signal(1);
  readonly pageSize = PAGE_SIZE;
  readonly maxWaFiles = MAX_WA_FILES;
  readonly waQueue = signal<File[]>([]);
  readonly waEstado = signal<'idle' | 'analizando' | 'preview' | 'error'>('idle');
  readonly waPreview = signal<WhatsappPreview | null>(null);
  readonly waItems = signal<WhatsappPreview[]>([]);
  readonly waDrafts = signal<Record<string, Draft>>({});
  readonly waErrors = signal<WhatsappAnalyzeError[]>([]);
  readonly waError = signal('');
  readonly waConfirmando = signal(false);
  readonly arrastrandoWa = signal(false);

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
    const mes = this.mesFiltro();
    const tipo = this.tipoFiltro();
    const semaforo = this.semaforoFiltro();
    const prox = this.proxSeguimientoFiltro();
    const prioridad = this.prioridadFiltro();
    const pendiente = this.pendienteFiltro();
    const encuesta = this.encuestaFiltro();
    const nombre = this.nombreFiltro().trim().toLowerCase();
    const numero = digits(this.numeroFiltro());
    return (this.data()?.seguimientoWhatsapp ?? [])
      .filter((r) => {
        if (hoja && (r.hojaOrigen || '') !== hoja) return false;
        const rowFecha = sheetContactFecha(r.fecha);
        if (fecha && rowFecha !== fecha) return false;
        if (mes && rowFecha.slice(0, 7) !== mes) return false;
        if (tipo && (r.tipo || '') !== tipo) return false;
        if (semaforo && (r.semaforo || '') !== semaforo) return false;
        if (prox && sheetCalendarDate(r.proximoSeguimiento) !== prox) return false;
        if (prioridad && (r.priorizar || '') !== prioridad) return false;
        if (pendiente && (r.pendiente || '') !== pendiente) return false;
        if (encuesta && encuestaKey(r.encuesta) !== encuesta) return false;
        if (nombre && !(r.cliente || '').toLowerCase().includes(nombre)) return false;
        if (numero && !digits(r.celular).includes(numero)) return false;
        return true;
      })
      .sort((a, b) => sheetDateKey(b.fecha).localeCompare(sheetDateKey(a.fecha)));
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
  readonly opcionesDisc = DISC_OPTIONS;

  discLabel(raw?: string | null): string {
    return discLabel(raw);
  }

  discTone(raw?: string | null): string {
    return discTone(raw);
  }

  fechaTabla(raw?: string | null): string {
    return formatContactFecha(raw);
  }

  fechaCelda(raw?: string | null): string {
    return formatSheetDate(raw);
  }
  readonly opcionesSemaforo = computed(() => this.mergeOpts(SEMAFORO_BASE, (r) => r.semaforo));
  readonly opcionesPrioridad = computed(() => this.mergeOpts(PRIORIDAD_BASE, (r) => r.priorizar));
  readonly opcionesAsignado = computed(() => this.mergeOpts(['ANDREA'], (r) => r.asignado));
  readonly opcionesRegistrada = computed(() => this.mergeOpts(REGISTRADA_BASE, (r) => r.registrado));
  readonly opcionesSiNo = SI_NO;
  readonly opcionesEncuesta = ENCUESTA_BASE;
  readonly discDetectadoPorIa = computed(() => {
    const preview = this.waPreview();
    const disc = normalizeDisc(this.draft().disc);
    if (!preview || !['D', 'I', 'S', 'C'].includes(disc)) return false;
    const existing = normalizeDisc(preview.coincidencias?.[0]?.disc);
    if (['D', 'I', 'S', 'C'].includes(existing) && existing === disc) return false;
    const campo = preview.campos?.['disc'];
    const ia = normalizeDisc(campo?.valor || preview.discAnalisis?.disc);
    return campo?.estado === 'INFERIDO' && ia === disc;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.aveUi.clearEntity());
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
    this.draft.update((d) => {
      const next = { ...d, [key]: value };
      const preview = this.waPreview();
      if (preview) {
        this.waDrafts.update((m) => ({ ...m, [preview.previewId]: next }));
      }
      if (preview || this.modo() === 'editar') {
        this.aveUi.setEntity({
          type: 'SEGUIMIENTO',
          allowed: {
            cliente: next.cliente,
            celular: next.celular,
            fecha: next.fecha,
            hoja: next.hojaOrigen,
            semaforo: next.semaforo,
            disc: normalizeDisc(next.disc),
          },
        });
      }
      return next;
    });
  }

  setFiltroHoja(value: string): void {
    this.hojaFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroFecha(value: string): void {
    this.fechaFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroMes(value: string): void {
    this.mesFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroTipo(value: string): void {
    this.tipoFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroSemaforo(value: string): void {
    this.semaforoFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroProxSeguimiento(value: string): void {
    this.proxSeguimientoFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroPrioridad(value: string): void {
    this.prioridadFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroPendiente(value: string): void {
    this.pendienteFiltro.set(value);
    this.pagina.set(1);
  }

  setFiltroEncuesta(value: string): void {
    this.encuestaFiltro.set(value);
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
    this.aveUi.clearEntity();
  }

  editar(row: SeguimientoWhatsapp): void {
    this.original.set(row);
    this.draft.set(fromRow(row));
    this.aviso.set('');
    this.modo.set('editar');
    this.publishAveFocus(row);
  }

  cancelar(): void {
    if (this.waItems().length && this.waPreview()) {
      this.waPreview.set(null);
      this.modo.set('lista');
      this.original.set(null);
      this.aveUi.clearEntity();
      return;
    }
    this.modo.set('lista');
    this.original.set(null);
    this.aveUi.clearEntity();
  }

  onWhatsappFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    this.enqueueWhatsapp(files);
  }

  onWhatsappDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrandoWa.set(false);
    const files = ev.dataTransfer?.files ? Array.from(ev.dataTransfer.files) : [];
    this.enqueueWhatsapp(files);
  }

  quitarWaFile(file: File): void {
    if (this.waEstado() === 'analizando') return;
    this.waQueue.update((list) => list.filter((f) => f !== file));
  }

  enqueueWhatsapp(files: File[]): void {
    if (!files.length || this.waEstado() === 'analizando') return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.txt') && !name.endsWith('.zip')) {
        rejected.push(file.name);
        continue;
      }
      accepted.push(file);
    }
    this.waQueue.update((current) => {
      const merged = [...current];
      for (const file of accepted) {
        const dup = merged.some((f) => f.name === file.name && f.size === file.size);
        if (!dup) merged.push(file);
      }
      if (merged.length > MAX_WA_FILES) {
        this.waError.set(`Máximo ${MAX_WA_FILES} archivos. El ZIP interno también cuenta hasta ${MAX_WA_FILES} chats.`);
        return merged.slice(0, MAX_WA_FILES);
      }
      return merged;
    });
    if (rejected.length) {
      this.waError.set('Solo .txt o .zip exportados desde WhatsApp: ' + rejected.slice(0, 4).join(', '));
    } else if (!this.waError().includes('Máximo')) {
      this.waError.set('');
    }
  }

  analizarWhatsappLote(): void {
    const files = this.waQueue();
    if (!files.length || this.waEstado() === 'analizando') return;
    this.waEstado.set('analizando');
    this.waError.set('');
    this.waErrors.set([]);
    this.waItems.set([]);
    this.waPreview.set(null);
    this.waDrafts.set({});
    this.whatsappApi.analyze(files).subscribe({
      next: (res) => {
        const items = res.items || [];
        this.waItems.set(items);
        this.waErrors.set(res.errors || []);
        if (!items.length) {
          this.waEstado.set('error');
          this.waError.set(
            res.errors?.[0]?.message || 'No se pudo analizar ningún chat de WhatsApp.'
          );
          return;
        }
        const drafts: Record<string, Draft> = {};
        for (const item of items) {
          drafts[item.previewId] = this.draftFromWhatsapp(item);
        }
        this.waDrafts.set(drafts);
        this.waEstado.set('preview');
        if (items.length === 1) {
          this.revisarWhatsapp(items[0]);
        }
      },
      error: (err) => {
        this.waEstado.set('error');
        this.waError.set(err?.error?.message || err?.error?.detail || 'No se pudo analizar el lote.');
      },
    });
  }

  waCliente(preview: WhatsappPreview): string {
    return preview.campos?.['cliente']?.valor || 'NO_IDENTIFICADO';
  }

  revisarWhatsapp(preview: WhatsappPreview): void {
    this.waPreview.set(preview);
    const draft = this.waDrafts()[preview.previewId] || this.draftFromWhatsapp(preview);
    this.draft.set(draft);
    this.aviso.set('');
    this.modo.set('nueva');
    this.original.set(null);
    this.publishAveFocus({
      fecha: draft.fecha,
      tipo: draft.tipo,
      canal: draft.canal,
      cliente: draft.cliente,
      celular: draft.celular,
      solicitud: draft.solicitud,
      respuesta: draft.respuesta,
      semaforo: draft.semaforo,
      cotizado: Boolean(draft.fechaCotizado),
      notas: draft.notas,
      fechaServicio: draft.fechaServicio,
      encuesta: draft.encuesta === 'SI',
      asignado: draft.asignado,
      proximoSeguimiento: draft.proximoSeguimiento,
      hojaOrigen: draft.hojaOrigen,
      disc: draft.disc,
    });
  }

  confirmarWhatsapp(updateExisting: boolean): void {
    const preview = this.waPreview();
    if (!preview || this.waConfirmando()) return;
    this.waConfirmando.set(true);
    const d = this.waDrafts()[preview.previewId] || this.draft();
    const row = this.rowFromDraft(d, preview, updateExisting);
    const hit = preview.coincidencias?.[0];
    this.whatsappApi.confirm(preview.previewId, row, updateExisting && !!hit).subscribe({
      next: (res) => {
        this.waConfirmando.set(false);
        this.finishSave(d, updateExisting && hit ? this.rowFromHit(hit) : null, res.message);
        this.quitarPreview(preview.previewId);
      },
      error: (err) => {
        this.waConfirmando.set(false);
        this.aviso.set(err?.error?.message || 'No se pudo guardar en el Registro.');
      },
    });
  }

  confirmarTodosWhatsapp(): void {
    const items = this.waItems();
    if (!items.length || this.waConfirmando()) return;
    const hoja = this.hojaFiltro() || this.hojas()[0] || '';
    if (!hoja) {
      this.aviso.set('Elige la hoja del Excel antes de guardar el lote.');
      return;
    }
    this.waConfirmando.set(true);
    const payload = items.map((preview) => {
      const draft = {
        ...(this.waDrafts()[preview.previewId] || this.draftFromWhatsapp(preview)),
        hojaOrigen: this.waDrafts()[preview.previewId]?.hojaOrigen || hoja,
      };
      return {
        previewId: preview.previewId,
        updateExisting: false,
        row: this.rowFromDraft(draft, preview, false),
      };
    });
    this.whatsappApi.confirmBatch(payload).subscribe({
      next: (res) => {
        this.waConfirmando.set(false);
        const failedIds = new Set((res.errors || []).map((e) => e.previewId).filter(Boolean));
        const saved = items.filter((p) => !failedIds.has(p.previewId));
        for (const preview of saved) {
          const d = this.waDrafts()[preview.previewId] || this.draftFromWhatsapp(preview);
          this.applyLocal({ ...d, hojaOrigen: d.hojaOrigen || hoja }, null);
        }
        this.aviso.set(res.message);
        this.dashboard.invalidateCache();
        if (failedIds.size) {
          this.waItems.set(items.filter((p) => failedIds.has(p.previewId)));
          this.waErrors.set(
            (res.errors || []).map((e) => ({ filename: e.previewId, message: e.message || 'Error' }))
          );
          this.waEstado.set('preview');
        } else {
          this.limpiarWhatsapp();
        }
        this.modo.set('lista');
        this.original.set(null);
        this.aveUi.clearEntity();
      },
      error: (err) => {
        this.waConfirmando.set(false);
        this.aviso.set(err?.error?.message || 'No se pudo guardar el lote en el Registro.');
      },
    });
  }

  cancelarWhatsapp(): void {
    for (const item of this.waItems()) {
      this.whatsappApi.cancel(item.previewId).subscribe({ error: () => undefined });
    }
    this.limpiarWhatsapp();
    this.modo.set('lista');
    this.original.set(null);
    this.aveUi.clearEntity();
  }

  private quitarPreview(previewId: string): void {
    const rest = this.waItems().filter((p) => p.previewId !== previewId);
    this.waItems.set(rest);
    this.waDrafts.update((m) => {
      const next = { ...m };
      delete next[previewId];
      return next;
    });
    this.waPreview.set(null);
    if (!rest.length) {
      this.limpiarWhatsapp();
    }
  }

  private rowFromDraft(d: Draft, preview: WhatsappPreview, updateExisting: boolean): Record<string, unknown> {
    const row: Record<string, unknown> = {
      ...d,
      canal: 'WHATSAPP',
      registrado: (d.registrado || '').trim() || 'WHATSAPP',
      cotizado: Boolean(d.fechaCotizado),
    };
    const hit = preview.coincidencias?.[0];
    if (updateExisting && hit) {
      row['matchCelular'] = hit.celular;
      row['matchFecha'] = hit.fecha;
      row['matchCliente'] = hit.cliente;
      row['hojaOrigen'] = hit.hojaOrigen || d.hojaOrigen;
      const existingDisc = normalizeDisc(hit.disc);
      if (['D', 'I', 'S', 'C'].includes(existingDisc)) {
        row['disc'] = existingDisc;
      }
    }
    return row;
  }

  private limpiarWhatsapp(): void {
    this.waQueue.set([]);
    this.waPreview.set(null);
    this.waItems.set([]);
    this.waDrafts.set({});
    this.waErrors.set([]);
    this.waEstado.set('idle');
    this.waError.set('');
  }

  private draftFromWhatsapp(preview: WhatsappPreview): Draft {
    const v = (k: string) => preview.campos?.[k]?.valor || '';
    const existingDisc = normalizeDisc(preview.coincidencias?.[0]?.disc);
    const iaDisc = normalizeDisc(v('disc') || preview.discAnalisis?.disc);
    const disc = ['D', 'I', 'S', 'C'].includes(existingDisc)
      ? existingDisc
      : ['D', 'I', 'S', 'C'].includes(iaDisc)
        ? iaDisc
        : 'N/A';
    return {
      ...emptyDraft(this.hojaFiltro() || this.hojas()[0] || ''),
      fecha: (v('fecha') || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      tipo: v('tipo') || 'B2C',
      canal: 'WHATSAPP',
      cliente: v('cliente'),
      celular: v('celular'),
      disc,
      solicitud: v('solicitud'),
      respuesta: v('respuesta'),
      semaforo: v('semaforo') || 'TIBIO',
      fechaCotizado: (preview.ultimaCotizacion?.fecha || v('fechaCotizado') || '').slice(0, 10),
      notas: v('notas') || preview.resumen || '',
      proximoSeguimiento: (v('proximoSeguimiento') || '').slice(0, 10),
      priorizar: v('priorizar') || 'ALTA',
      pendiente: v('pendiente') || 'SI',
      asignado: v('asignado'),
      fechaServicio: (v('fechaServicio') || '').slice(0, 10),
      registrado: 'WHATSAPP',
      objecion: v('objecion'),
      encuesta: v('encuesta') || 'PENDIENTE',
    };
  }

  private rowFromHit(hit: { cliente?: string; celular?: string; fecha?: string; hojaOrigen?: string }): SeguimientoWhatsapp {
    return {
      fecha: hit.fecha || '',
      tipo: '',
      canal: 'WHATSAPP',
      cliente: hit.cliente || '',
      celular: hit.celular || '',
      solicitud: '',
      respuesta: '',
      semaforo: '',
      cotizado: false,
      notas: '',
      fechaServicio: '',
      encuesta: false,
      asignado: '',
      proximoSeguimiento: '',
      hojaOrigen: hit.hojaOrigen,
    };
  }

  guardar(): void {
    if (this.waPreview()) {
      this.confirmarWhatsapp(false);
      return;
    }
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

  eliminar(row: SeguimientoWhatsapp): void {
    if (this.deleting() || this.saving()) return;
    const quien = row.cliente || row.celular || 'esta fila';
    if (!confirm(`¿Eliminar del Excel la fila de ${quien}? Esta acción no se puede deshacer.`)) {
      return;
    }
    this.deleting.set(true);
    this.aviso.set('');
    this.integrations
      .deleteSeguimiento({
        hojaOrigen: row.hojaOrigen,
        matchCelular: row.celular,
        matchFecha: row.fecha,
        matchCliente: row.cliente,
        celular: row.celular,
        fecha: row.fecha,
        cliente: row.cliente,
      })
      .subscribe({
        next: (res) => {
          this.deleting.set(false);
          this.removeLocal(row);
          if (this.original() && this.sameRow(this.original()!, row)) {
            this.cancelar();
          }
          this.aviso.set(res.message || 'Fila eliminada del Excel.');
          this.dashboard.invalidateCache();
        },
        error: (err) => {
          this.deleting.set(false);
          this.aviso.set(err?.message || 'No se pudo eliminar la fila.');
        },
      });
  }

  eliminarDraft(): void {
    const orig = this.original();
    if (orig) this.eliminar(orig);
  }

  private finishSave(d: Draft, orig: SeguimientoWhatsapp | null, message?: string): void {
    this.saving.set(false);
    this.applyLocal(d, orig);
    this.modo.set('lista');
    this.original.set(null);
    this.aveUi.clearEntity();
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

  private removeLocal(orig: SeguimientoWhatsapp): void {
    const current = this.data();
    if (!current) return;
    const list = (current.seguimientoWhatsapp ?? []).filter((r) => !this.sameRow(r, orig));
    this.data.set({ ...current, seguimientoWhatsapp: list });
  }

  private sameRow(a: SeguimientoWhatsapp, b: SeguimientoWhatsapp): boolean {
    return (
      (a.celular || '') === (b.celular || '') &&
      (a.fecha || '').slice(0, 10) === (b.fecha || '').slice(0, 10) &&
      (a.hojaOrigen || '') === (b.hojaOrigen || '') &&
      (a.cliente || '') === (b.cliente || '')
    );
  }

  private publishAveFocus(row: SeguimientoWhatsapp): void {
    this.aveUi.setEntity({
      type: 'SEGUIMIENTO',
      allowed: {
        cliente: row.cliente || '',
        celular: row.celular || '',
        fecha: (row.fecha || '').slice(0, 10),
        hoja: row.hojaOrigen || '',
        semaforo: row.semaforo || '',
        disc: normalizeDisc(row.disc)
      }
    });
  }

  private mergeOpts(base: string[], pick: (r: SeguimientoWhatsapp) => string | undefined): string[] {
    const extra = (this.data()?.seguimientoWhatsapp ?? [])
      .map(pick)
      .map((v) => (v || '').trim())
      .filter(Boolean);
    return [...new Set([...base, ...extra])].sort((a, b) => a.localeCompare(b, 'es'));
  }
}
