import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, finalize, interval } from 'rxjs';
import {
  AutobitsApiService,
  AutobitsRecord,
  ImportResult,
} from '../../services/autobits-api.service';
import { CrossingsApiService, CrossingSummary } from '../../services/crossings-api.service';
import {
  BatchUploadItem,
  DocumentSummary,
  DocumentsApiService,
} from '../../services/documents-api.service';
import { FacturasApiService } from '../../services/facturas-api.service';
import { FoldersApiService, InvoiceFolder } from '../../services/folders-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { formatCop } from '../../utils/contabilidad-labels';

const SESSION_KEY = 'contab-wizard-session';
const FOLDER_KEY = 'contab-wizard-folder-id';
const PACK_MAX = 25;

interface ChatMsg {
  role: 'user' | 'ia';
  text: string;
}

@Component({
  selector: 'eas-contabilidad-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './wizard.component.html',
  styleUrl: './wizard.component.scss',
})
export class WizardComponent implements OnInit, OnDestroy {
  private readonly autobitsApi = inject(AutobitsApiService);
  private readonly docsApi = inject(DocumentsApiService);
  private readonly foldersApi = inject(FoldersApiService);
  private readonly crossingsApi = inject(CrossingsApiService);
  private readonly download = inject(ContabilidadDownloadService);
  private readonly facturasApi = inject(FacturasApiService);
  private readonly destroyRef = inject(DestroyRef);

  private restoreSeq = 0;

  readonly formatCop = formatCop;
  readonly packMax = PACK_MAX;
  readonly steps = [
    { n: 1, title: 'Carpetas + facturas', hint: 'Acumula facturas durante la semana.' },
    { n: 2, title: 'Autobits + cruce', hint: 'Adjunta el Excel y cruza al final.' },
  ];
  readonly chatSugerencias = [
    'Cruza cada factura de la carpeta con Autobits (compra, reserva, valor).',
    '¿Cuáles necesitan revisión y qué dato de Autobits les falta?',
    'Lista NIT, compra y reserva detectados en facturas vs Autobits.',
    'Resume diferencias de totales factura vs Autobits.',
  ];

  paso = signal(1);
  limpiando = signal(false);
  confirmandoVaciar = signal(false);
  error = signal('');
  aviso = signal('');
  aiWarn = signal('');

  carpetas = signal<InvoiceFolder[]>([]);
  carpetaActiva = signal<InvoiceFolder | null>(null);
  nuevaCarpetaNombre = '';

  subiendoAutobits = signal(false);
  arrastrandoAutobits = signal(false);
  autobits = signal<ImportResult | null>(null);
  records = signal<AutobitsRecord[]>([]);
  verTodosRecords = signal(false);

  generandoExcel = signal(false);

  subiendoFacturas = signal(false);
  arrastrandoFacturas = signal(false);
  facturaItems = signal<BatchUploadItem[]>([]);
  idsFacturasOperacion = signal<number[]>([]);
  documentos = signal<DocumentSummary[]>([]);
  crossings = signal<CrossingSummary[]>([]);
  packMsg = signal('');
  chatInput = '';
  chatMsgs = signal<ChatMsg[]>([]);
  preguntando = signal(false);

  private poll?: Subscription;
  private autobitsUpload?: Subscription;

  ngOnInit(): void {
    sessionStorage.setItem(SESSION_KEY, '1');
    this.cargarCarpetas(true);
    this.restaurarAutobits();
    this.facturasApi
      .health()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (h) => {
          if (h.ai_key_configured === false || h.ai === false) {
            this.aiWarn.set(
              h.hint ||
                'Claude no está configurado (falta ANTHROPIC_API_KEY). Las facturas no mostrarán datos hasta reiniciar Contabilidad con la clave.'
            );
          } else {
            this.aiWarn.set('');
          }
        },
        error: () => {
          this.aiWarn.set(
            'No se pudo verificar Claude/OCR. Revisa que Contabilidad esté arriba y con ANTHROPIC_API_KEY.'
          );
        },
      });
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
    this.autobitsUpload?.unsubscribe();
  }

  readonly recordsVista = computed(() => {
    const all = this.records();
    return this.verTodosRecords() ? all : all.slice(0, 12);
  });

  readonly relaciones = computed(() => {
    const pack = new Set(this.idsFacturasOperacion());
    const docs = new Set(this.documentos().map((d) => d.id));
    const scope = pack.size ? pack : docs;
    return this.crossings().filter((c) => {
      if (!c.document_id || !c.autobits_record_id) return false;
      if (!scope.size) return true;
      return scope.has(c.document_id);
    });
  });

  readonly facturasRevision = computed(() =>
    this.documentos().filter((d) => d.requiere_revision)
  );

  readonly idsParaExcel = computed(() => {
    const fromFolder = this.carpetaActiva()?.document_ids || [];
    if (fromFolder.length) {
      return fromFolder;
    }
    const operacion = this.idsFacturasOperacion().filter(
      (id): id is number => typeof id === 'number' && Number.isFinite(id)
    );
    if (operacion.length) {
      return operacion;
    }
    return this.documentos().map((d) => d.id);
  });

  readonly idsListosParaExcel = computed(() => {
    const blocked = new Set(['RECIBIDO', 'PROCESANDO']);
    const byId = new Map(this.documentos().map((d) => [d.id, d]));
    return this.idsParaExcel().filter((id) => {
      const doc = byId.get(id);
      if (!doc) {
        return true;
      }
      return !blocked.has((doc.estado || '').toUpperCase());
    });
  });

  readonly facturasEnProceso = computed(() => {
    const ids = new Set(this.idsParaExcel());
    const pool = ids.size
      ? this.documentos().filter((d) => ids.has(d.id))
      : this.documentos();
    return pool.some((d) =>
      ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
    );
  });

  readonly puedeGenerarExcel = computed(() => {
    if (this.generandoExcel()) {
      return false;
    }
    return this.idsListosParaExcel().length > 0 && !this.facturasEnProceso();
  });

  readonly kpis = computed(() => ({
    autobits: this.autobits()?.imported_rows || this.records().length,
    facturas: this.idsParaExcel().length || this.documentos().length,
    revision: this.facturasRevision().length,
    carpetas: this.carpetas().length,
  }));

  crearCarpeta(): void {
    const name = this.nuevaCarpetaNombre.trim();
    if (!name) {
      return;
    }
    this.error.set('');
    this.foldersApi.create(name).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (folder) => {
        this.nuevaCarpetaNombre = '';
        this.aviso.set(`Carpeta «${folder.name}» creada.`);
        this.carpetas.update((list) => [folder, ...list]);
        this.aplicarCarpeta(folder);
        this.paso.set(1);
      },
      error: (err) => {
        this.error.set(this.detalleError(err, 'No se pudo crear la carpeta.'));
      },
    });
  }

  seleccionarCarpeta(id: number): void {
    this.foldersApi.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (folder) => this.aplicarCarpeta(folder),
      error: (err) => this.error.set(this.detalleError(err, 'No se pudo abrir la carpeta.')),
    });
  }

  vaciarImportados(): void {
    if (this.limpiando()) {
      return;
    }
    this.confirmandoVaciar.set(true);
  }

  cancelarVaciar(): void {
    this.confirmandoVaciar.set(false);
  }

  confirmarVaciar(): void {
    if (this.limpiando()) {
      return;
    }
    this.confirmandoVaciar.set(false);
    this.restoreSeq += 1;
    this.limpiando.set(true);
    this.error.set('');
    this.autobitsApi
      .purgeExcels(true)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.limpiando.set(false))
      )
      .subscribe({
        next: () => {
          this.resetLocal();
          this.aviso.set('Cargas anteriores vaciadas. Elige o crea una carpeta de facturas.');
        },
        error: (err) => {
          this.error.set(this.detalleError(err, 'No se pudieron vaciar las cargas.'));
        },
      });
  }

  @HostListener('document:keydown.escape')
  onEscapeVaciar(): void {
    if (this.confirmandoVaciar()) {
      this.cancelarVaciar();
    }
  }

  onAutobits(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.subirAutobits(file);
  }

  onAutobitsDragOver(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.subiendoAutobits() || this.limpiando()) return;
    this.arrastrandoAutobits.set(true);
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'copy';
    }
  }

  onAutobitsDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.arrastrandoAutobits.set(false);
  }

  onAutobitsDrop(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.arrastrandoAutobits.set(false);
    if (this.subiendoAutobits() || this.limpiando()) return;
    const file = Array.from(ev.dataTransfer?.files ?? []).find((f) =>
      /\.(xlsx|xls|xlsm|csv)$/i.test(f.name)
    );
    if (!file) {
      this.error.set('Suelta un Excel de Autobits (.xlsx, .xls, .csv).');
      return;
    }
    this.subirAutobits(file);
  }

  private subirAutobits(file: File): void {
    this.restoreSeq += 1;
    this.error.set('');
    this.aviso.set('Leyendo el Excel de Autobits…');
    this.autobitsUpload?.unsubscribe();
    this.subiendoAutobits.set(true);
    this.autobitsUpload = this.autobitsApi
      .uploadDirect(file, true)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.subiendoAutobits.set(false))
      )
      .subscribe({
        next: (res) => {
          this.aplicarAutobits(res);
          this.vincularAutobitsACarpeta(res.batch?.id);
          this.paso.set(2);
        },
        error: (err) => {
          this.error.set(this.detalleError(err, 'No se pudo leer el Excel de Autobits.'));
          this.aviso.set('');
        },
      });
  }

  async generarExcel(): Promise<void> {
    if (this.generandoExcel() || !this.puedeGenerarExcel()) return;
    this.generandoExcel.set(true);
    this.error.set('');
    this.aviso.set('Generando Excel de cruce de la carpeta…');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const documentIds = [...this.idsListosParaExcel()];
      if (!documentIds.length) {
        this.error.set('Espere a que Claude termine de leer las facturas de la carpeta.');
        return;
      }
      await this.download.download(
        this.docsApi.exportExcelUrl(documentIds),
        `Cruce_Cuentas_${today}.xlsx`
      );
      this.aviso.set('Excel de cruce descargado.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo generar el Excel.');
    } finally {
      this.generandoExcel.set(false);
    }
  }

  onFacturas(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    (ev.target as HTMLInputElement).value = '';
    void this.subirFacturas(files);
  }

  onFacturasZip(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    (ev.target as HTMLInputElement).value = '';
    void this.subirFacturas(files);
  }

  onFacturasCarpeta(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    (ev.target as HTMLInputElement).value = '';
    void this.subirFacturas(files);
  }

  onFacturasDragOver(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.subiendoFacturas() || !this.carpetaActiva()) return;
    this.arrastrandoFacturas.set(true);
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'copy';
    }
  }

  onFacturasDragLeave(ev: DragEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.arrastrandoFacturas.set(false);
  }

  async onFacturasDrop(ev: DragEvent): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    this.arrastrandoFacturas.set(false);
    if (this.subiendoFacturas() || !this.carpetaActiva()) {
      if (!this.carpetaActiva()) {
        this.error.set('Crea o elige una carpeta antes de subir facturas.');
      }
      return;
    }
    const files = await this.collectDroppedInvoiceFiles(ev.dataTransfer);
    if (!files.length) {
      this.error.set('Suelta facturas (PDF/JPG/PNG), una carpeta o un ZIP.');
      return;
    }
    await this.subirFacturas(files);
  }

  private async subirFacturas(files: File[]): Promise<void> {
    const payload = this.filterInvoiceUploads(files);
    if (!payload.length) {
      this.error.set('No hay facturas ni ZIP válidos en la selección.');
      return;
    }
    const folder = this.carpetaActiva();
    if (!folder) {
      this.error.set('Crea o elige una carpeta antes de subir facturas.');
      return;
    }
    const hasZip = payload.some((f) => /\.zip$/i.test(f.name));
    const looseCount = payload.filter((f) => !/\.zip$/i.test(f.name)).length;
    if (!hasZip && payload.length > PACK_MAX) {
      this.error.set(
        `Máximo ${PACK_MAX} facturas por carga. Seleccionaste ${payload.length}. Divide la carga.`
      );
      return;
    }
    if (hasZip && looseCount > PACK_MAX) {
      this.error.set(
        `Máximo ${PACK_MAX} facturas por carga (sin contar el ZIP). Seleccionaste ${looseCount}.`
      );
      return;
    }
    this.subiendoFacturas.set(true);
    this.error.set('');
    const label =
      payload.length === 1 && !hasZip
        ? `Integrando 1 factura en «${folder.name}»…`
        : hasZip
          ? `Integrando ${payload.length} ítem(s) (archivos/ZIP) en «${folder.name}»…`
          : `Integrando ${payload.length} factura(s) en «${folder.name}»…`;
    this.aviso.set(label);
    this.docsApi
      .uploadBatch(payload, 'FACTURA', PACK_MAX)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.subiendoFacturas.set(false))
      )
      .subscribe({
        next: (res) => {
          this.facturaItems.set([...(res.items || [])]);
          const nuevos = this.idsDePaquete(res.queued_ids, res.items);
          const previos = [
            ...(folder.document_ids || []),
            ...this.idsFacturasOperacion(),
          ];
          const merged = [...new Set([...previos, ...nuevos].filter((id) => id > 0))];
          this.idsFacturasOperacion.set(merged);
          const integradas = nuevos.length || (res.items || []).filter((i) => i.ok).length;
          const msg =
            res.mensaje ||
            `${integradas} factura(s) integradas en «${folder.name}». Ya van ${merged.length} en la carpeta.`;
          this.packMsg.set(msg);
          this.aviso.set(
            `${integradas} factura(s) añadidas a «${folder.name}». Total en carpeta: ${merged.length}.`
          );
          this.foldersApi
            .addDocuments(folder.id, nuevos)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (r) => {
                this.aplicarCarpeta(r.folder);
                const total = r.folder.document_count || r.folder.document_ids?.length || merged.length;
                this.aviso.set(
                  `${r.added ?? integradas} factura(s) integradas en «${r.folder.name}». Total: ${total}.`
                );
                this.refrescarFacturas();
                this.startPoll();
              },
              error: () => {
                this.refrescarFacturas();
                this.startPoll();
              },
            });
          this.paso.set(1);
        },
        error: (err) => {
          this.error.set(this.detalleError(err, 'No se pudieron subir las facturas.'));
        },
      });
  }

  private filterInvoiceUploads(files: File[]): File[] {
    return files.filter((f) => {
      const name = (f.name || '').split(/[/\\]/).pop() || '';
      if (!name || name.startsWith('.')) return false;
      return /\.(jpe?g|png|pdf|webp|zip)$/i.test(name);
    });
  }

  private async collectDroppedInvoiceFiles(dt: DataTransfer | null): Promise<File[]> {
    if (!dt) return [];
    const items = dt.items;
    if (items?.length) {
      const collected: File[] = [];
      const walks: Promise<void>[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) {
          walks.push(this.walkFileSystemEntry(entry, collected));
        }
      }
      if (walks.length) {
        await Promise.all(walks);
        return this.filterInvoiceUploads(collected);
      }
    }
    return this.filterInvoiceUploads(Array.from(dt.files || []));
  }

  private walkFileSystemEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(
          (file) => {
            out.push(file);
            resolve();
          },
          (err) => reject(err)
        );
        return;
      }
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readBatch = (): void => {
          reader.readEntries(
            (entries) => {
              if (!entries.length) {
                resolve();
                return;
              }
              Promise.all(entries.map((child) => this.walkFileSystemEntry(child, out)))
                .then(() => readBatch())
                .catch(reject);
            },
            (err) => reject(err)
          );
        };
        readBatch();
        return;
      }
      resolve();
    });
  }

  usarSugerencia(texto: string): void {
    this.chatInput = texto;
    this.preguntar();
  }

  preguntar(): void {
    const pregunta = this.chatInput.trim();
    if (!pregunta || this.preguntando()) return;
    const folder = this.carpetaActiva();
    if (!folder) {
      this.error.set('Elige una carpeta para preguntar a la IA.');
      return;
    }
    this.preguntando.set(true);
    this.chatInput = '';
    this.chatMsgs.update((msgs) => [...msgs, { role: 'user', text: pregunta }]);
    this.foldersApi.ask(folder.id, pregunta).subscribe({
      next: (res) => {
        this.preguntando.set(false);
        const texto = res.ok ? res.respuesta : res.error || 'La IA no pudo responder.';
        this.chatMsgs.update((msgs) => [...msgs, { role: 'ia', text: texto }]);
      },
      error: (err) => {
        this.preguntando.set(false);
        this.chatMsgs.update((msgs) => [
          ...msgs,
          { role: 'ia', text: this.detalleError(err, 'No se pudo consultar la IA.') },
        ]);
      },
    });
  }

  tonoEstado(estado: string): string {
    const e = (estado || '').toUpperCase();
    if (e === 'REQUIERE_REVISION' || e === 'DUPLICADO') return 'warn';
    if (e === 'ERROR') return 'bad';
    if (['EXTRAIDO', 'PROCESADO', 'APROBADO'].includes(e)) return 'ok';
    return '';
  }

  private cargarCarpetas(restoreActive = false): void {
    this.foldersApi
      .list(40)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const items = res.items || [];
          this.carpetas.set(items);
          if (!restoreActive) {
            return;
          }
          const saved = this.leerFolderId();
          const pick = items.find((f) => f.id === saved) || items[0];
          if (pick) {
            this.seleccionarCarpeta(pick.id);
          } else {
            this.paso.set(1);
          }
        },
        error: () => {
          this.aviso.set('No se pudieron cargar carpetas. Puedes crear una nueva.');
        },
      });
  }

  private aplicarCarpeta(folder: InvoiceFolder): void {
    this.carpetaActiva.set(folder);
    this.guardarFolderId(folder.id);
    this.idsFacturasOperacion.set([...(folder.document_ids || [])]);
    this.refrescarFacturas();
    if (folder.autobits_batch_id) {
      this.paso.set(2);
      this.cargarRecords(folder.autobits_batch_id);
    } else {
      this.paso.set(1);
    }
  }

  private vincularAutobitsACarpeta(batchId?: number): void {
    const folder = this.carpetaActiva();
    if (!folder || !batchId) {
      return;
    }
    this.foldersApi
      .patch(folder.id, { autobits_batch_id: batchId, status: 'READY' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.carpetaActiva.set(updated);
          this.carpetas.update((list) => list.map((f) => (f.id === updated.id ? updated : f)));
          this.aviso.set(`Autobits vinculado a «${updated.name}». Ya puedes cruzar o preguntar a la IA.`);
          this.startPoll();
        },
        error: () => {
          this.aviso.set('Autobits cargado, pero no se pudo vincular a la carpeta.');
        },
      });
  }

  private idsDePaquete(
    queued: number[] | undefined,
    items: BatchUploadItem[] | undefined
  ): number[] {
    const fromQueued = (queued || []).filter((id) => Number.isFinite(id) && id > 0);
    const fromItems = (items || [])
      .flatMap((item) => [item.document?.id, item.duplicate_document_id])
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);
    return [...new Set([...fromQueued, ...fromItems])];
  }

  private aplicarAutobits(res: ImportResult): void {
    this.autobits.set({ ...res, records: [...(res.records || [])] });
    const fromRes = [...(res.records || [])];
    this.records.set(fromRes);
    if (!fromRes.length) {
      this.cargarRecords(res.batch?.id);
    }
    const reused = res.reused ? ' (ya estaba importado)' : '';
    const linked = this.carpetaActiva()
      ? ' Se vinculan a la carpeta activa si está seleccionada.'
      : ' Puedes vincularlos luego eligiendo una carpeta.';
    this.aviso.set(
      res.aviso || `${res.imported_rows} filas de Autobits${reused}.${linked}`
    );
    if (res.parse_errors?.length) {
      this.error.set(res.parse_errors.slice(0, 3).join(' · '));
    }
  }

  private resetLocal(): void {
    this.autobits.set(null);
    this.records.set([]);
    this.facturaItems.set([]);
    this.idsFacturasOperacion.set([]);
    this.documentos.set([]);
    this.crossings.set([]);
    this.chatMsgs.set([]);
    this.packMsg.set('');
    this.paso.set(1);
    const folder = this.carpetaActiva();
    if (folder) {
      this.seleccionarCarpeta(folder.id);
    }
  }

  private cargarRecords(batchId?: number): void {
    const seq = this.restoreSeq;
    const id = batchId || this.autobits()?.batch?.id || this.carpetaActiva()?.autobits_batch_id;
    this.autobitsApi
      .listRecords({ batch_id: id ?? undefined, limit: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (seq !== this.restoreSeq) return;
          this.records.set([...(res.items || [])]);
        },
        error: () => {
          if (seq !== this.restoreSeq) return;
          if (!this.records().length) this.records.set([]);
        },
      });
  }

  private refrescarFacturas(): void {
    const ids = this.idsParaExcel();
    this.docsApi.list({ limit: 200 }).subscribe({
      next: (res) => {
        const all = res.items || [];
        if (ids.length) {
          const set = new Set(ids);
          this.documentos.set(all.filter((d) => set.has(d.id)));
        } else {
          this.documentos.set(all);
        }
      },
      error: () => undefined,
    });
    this.crossingsApi
      .list({
        limit: 200,
        batch_id: this.carpetaActiva()?.autobits_batch_id || this.autobits()?.batch?.id,
      })
      .subscribe({
        next: (res) => this.crossings.set(res.items || []),
        error: () => undefined,
      });
  }

  private startPoll(): void {
    this.poll?.unsubscribe();
    this.poll = interval(2000).subscribe(() => {
      this.refrescarFacturas();
      const pending = this.documentos().some((d) =>
        ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
      );
      if (!pending && this.documentos().length) {
        this.poll?.unsubscribe();
        const batchId = this.carpetaActiva()?.autobits_batch_id || this.autobits()?.batch?.id;
        if (batchId) {
          this.crossingsApi.runMatching(batchId).subscribe({
            next: () => this.refrescarFacturas(),
          });
        }
      }
    });
  }

  private restaurarAutobits(): void {
    const seq = this.restoreSeq;
    this.autobitsApi.getLatestBatch().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (batch) => {
        if (seq !== this.restoreSeq) return;
        this.autobits.set({
          batch,
          imported_rows: batch.imported_rows,
          skipped_duplicates: 0,
          skipped_empty: 0,
          parse_errors: [],
        });
        this.cargarRecords(batch.id);
      },
      error: () => undefined,
    });
  }

  private guardarFolderId(id: number): void {
    try {
      sessionStorage.setItem(FOLDER_KEY, String(id));
    } catch {
      /* ignore */
    }
  }

  private leerFolderId(): number | null {
    try {
      const raw = sessionStorage.getItem(FOLDER_KEY);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  private detalleError(
    err: { status?: number; error?: { detail?: unknown; message?: string; error?: string } },
    fallback: string
  ): string {
    const status = err?.status;
    const d = err?.error?.detail ?? err?.error?.message ?? err?.error?.error;
    if (status === 404) {
      return (
        (typeof d === 'string' && d !== 'Not Found' ? d : null) ||
        'API de carpetas no encontrada. Hay que reconstruir el servicio Contabilidad en el servidor (docker compose build contabilidad).'
      );
    }
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d
        .map((x) => (typeof x === 'string' ? x : (x as { msg?: string })?.msg || ''))
        .filter(Boolean)
        .join(' ');
    }
    if (d && typeof d === 'object' && 'message' in d) {
      return String((d as { message: string }).message);
    }
    return fallback;
  }
}
