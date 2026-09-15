import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, finalize, firstValueFrom, interval } from 'rxjs';
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
import { UiFeedbackService } from '../../../../core/services/ui-feedback.service';

const SESSION_KEY = 'contab-wizard-session';
const FOLDER_KEY = 'contab-wizard-folder-id';
const PACK_MAX = 25;
/** Por debajo del client_max_body_size típico del Nginx host Oracle (25m). */
const PACK_MAX_BYTES = 18 * 1024 * 1024;

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
  private readonly feedback = inject(UiFeedbackService);

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
  copiadoId = signal<number | null>(null);
  reanalizando = signal(false);

  private poll?: Subscription;
  private autobitsUpload?: Subscription;
  private folderSeq = 0;

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
            this.feedback.error(h.hint ||
                'Claude no está configurado (falta ANTHROPIC_API_KEY). Las facturas no mostrarán datos hasta reiniciar Contabilidad con la clave.');
          } else {
            
          }
        },
        error: () => {
          this.feedback.error('No se pudo verificar Claude/OCR. Revisa que Contabilidad esté arriba y con ANTHROPIC_API_KEY.');
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
    // Con carpeta activa: SOLO sus document_ids (aunque esté vacía).
    // No reutilizar facturas de la carpeta anterior ni el listado global.
    const folder = this.carpetaActiva();
    if (folder) {
      return [...(folder.document_ids || [])];
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
    
    this.foldersApi.create(name).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (folder) => {
        this.nuevaCarpetaNombre = '';
        this.feedback.success(`Carpeta «${folder.name}» creada.`);
        this.carpetas.update((list) => [folder, ...list]);
        this.aplicarCarpeta(folder);
        this.paso.set(1);
      },
      error: (err) => {
        this.feedback.error(this.detalleError(err, 'No se pudo crear la carpeta.'));
      },
    });
  }

  seleccionarCarpeta(id: number): void {
    this.foldersApi.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (folder) => this.aplicarCarpeta(folder),
      error: (err) => this.feedback.error(this.detalleError(err, 'No se pudo abrir la carpeta.')),
    });
  }

  async eliminarCarpeta(ev: Event, folder: InvoiceFolder): Promise<void> {
    ev.stopPropagation();
    ev.preventDefault();
    const name = folder.name || `Carpeta #${folder.id}`;
    const ok = await this.feedback.confirm(
      `¿Eliminar la carpeta «${name}»?\n\n` +
        `Se quita la carpeta de la lista. Las facturas subidas no se borran del sistema; ` +
        `solo dejan de estar agrupadas aquí.`,
      { title: 'Eliminar carpeta', confirmLabel: 'Eliminar' }
    );
    if (!ok) {
      return;
    }
    
    this.foldersApi.delete(folder.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.carpetas.update((list) => list.filter((f) => f.id !== folder.id));
        if (this.carpetaActiva()?.id === folder.id) {
          this.carpetaActiva.set(null);
          this.idsFacturasOperacion.set([]);
          this.documentos.set([]);
          this.facturaItems.set([]);
          this.crossings.set([]);
          this.chatMsgs.set([]);
          this.packMsg.set('');
          try {
            sessionStorage.removeItem(FOLDER_KEY);
          } catch {
            /* ignore */
          }
          const next = this.carpetas()[0];
          if (next) {
            this.seleccionarCarpeta(next.id);
          } else {
            this.paso.set(1);
            this.feedback.success(`Carpeta «${name}» eliminada.`);
          }
        } else {
          this.feedback.success(`Carpeta «${name}» eliminada.`);
        }
      },
      error: (err) => this.feedback.error(this.detalleError(err, 'No se pudo eliminar la carpeta.')),
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
    
    this.autobitsApi
      .purgeExcels(true)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.limpiando.set(false))
      )
      .subscribe({
        next: () => {
          this.resetLocal();
          this.feedback.success('Cargas anteriores vaciadas. Elige o crea una carpeta de facturas.');
        },
        error: (err) => {
          this.feedback.error(this.detalleError(err, 'No se pudieron vaciar las cargas.'));
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
      this.feedback.error('Suelta un Excel de Autobits (.xlsx, .xls, .csv).');
      return;
    }
    this.subirAutobits(file);
  }

  private subirAutobits(file: File): void {
    this.restoreSeq += 1;
    
    this.feedback.info('Leyendo el Excel de Autobits…');
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
          this.feedback.error(this.detalleError(err, 'No se pudo leer el Excel de Autobits.'));
          
        },
      });
  }

  async generarExcel(): Promise<void> {
    if (this.generandoExcel() || !this.puedeGenerarExcel()) return;
    this.generandoExcel.set(true);
    
    this.feedback.info('Generando Excel de cruce de la carpeta…');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const documentIds = [...this.idsListosParaExcel()];
      if (!documentIds.length) {
        this.feedback.error('Espere a que Claude termine de leer las facturas de la carpeta.');
        return;
      }
      await this.download.download(
        this.docsApi.exportExcelUrl(documentIds),
        `Cruce_Cuentas_${today}.xlsx`
      );
      this.feedback.success('Excel de cruce descargado.');
    } catch (err) {
      this.feedback.error(err instanceof Error ? err.message : 'No se pudo generar el Excel.');
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
        this.feedback.error('Crea o elige una carpeta antes de subir facturas.');
      }
      return;
    }
    const files = await this.collectDroppedInvoiceFiles(ev.dataTransfer);
    if (!files.length) {
      this.feedback.error('Suelta facturas (PDF/JPG/PNG), una carpeta o un ZIP.');
      return;
    }
    await this.subirFacturas(files);
  }

  private async subirFacturas(files: File[]): Promise<void> {
    const selected = this.filterInvoiceUploads(files);
    if (!selected.length) {
      this.feedback.error('No hay facturas ni ZIP válidos en la selección.');
      return;
    }
    const folder = this.carpetaActiva();
    if (!folder) {
      this.feedback.error('Crea o elige una carpeta antes de subir facturas.');
      return;
    }

    this.subiendoFacturas.set(true);
    
    this.feedback.info('Preparando archivos…');

    let invoices: File[];
    try {
      invoices = await this.expandZipsToInvoices(selected);
    } catch (err) {
      this.subiendoFacturas.set(false);
      this.feedback.error(err instanceof Error ? err.message : 'No se pudo abrir el ZIP. Comprueba que sea un .zip válido.');
      
      return;
    }

    if (!invoices.length) {
      this.subiendoFacturas.set(false);
      this.feedback.error('No hay facturas PDF/JPG/PNG dentro de la selección (¿ZIP vacío o solo otros tipos?).');
      
      return;
    }

    const tooBig = invoices.filter((f) => f.size > PACK_MAX_BYTES);
    if (tooBig.length) {
      this.subiendoFacturas.set(false);
      this.feedback.error(`Estas facturas pesan más de 18 MB y el proxy las bloquea: ${tooBig
          .slice(0, 3)
          .map((f) => f.name)
          .join(', ')}${tooBig.length > 3 ? '…' : ''}. Comprime o divide el PDF.`);
      
      return;
    }

    const chunks = this.chunkFilesBySize(invoices, PACK_MAX, PACK_MAX_BYTES);

    const allItems: BatchUploadItem[] = [];
    const allNuevos: number[] = [];
    let lastMsg = '';

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.feedback.info(chunks.length > 1
            ? `Integrando paquete ${i + 1}/${chunks.length} (${chunk.length} factura(s)) en «${folder.name}»…`
            : `Integrando ${chunk.length} factura(s) en «${folder.name}»…`);
        const res = await firstValueFrom(
          this.docsApi.uploadBatch(chunk, 'FACTURA', PACK_MAX).pipe(takeUntilDestroyed(this.destroyRef))
        );
        allItems.push(...(res.items || []));
        allNuevos.push(...this.idsDePaquete(res.queued_ids, res.items));
        lastMsg = res.mensaje || lastMsg;
      }
    } catch (err) {
      this.feedback.error(
        this.detalleError(
          err as { status?: number; error?: unknown; message?: string },
          'No se pudieron subir las facturas.'
        )
      );
      
      this.facturaItems.set(allItems);
      this.subiendoFacturas.set(false);
      return;
    } finally {
      this.subiendoFacturas.set(false);
    }

    this.facturaItems.set(allItems);
    const nuevos = [...new Set(allNuevos.filter((id) => id > 0))];
    if (!nuevos.length) {
      const failMsg =
        lastMsg ||
        allItems.find((i) => i.error)?.error ||
        'No se integró ninguna factura.';
      this.feedback.error(failMsg);
      
      this.packMsg.set(failMsg);
      return;
    }

    const previos = [...(folder.document_ids || []), ...this.idsFacturasOperacion()];
    const merged = [...new Set([...previos, ...nuevos].filter((id) => id > 0))];
    this.idsFacturasOperacion.set(merged);
    const msg =
      lastMsg ||
      `${nuevos.length} factura(s) integradas en «${folder.name}». Ya van ${merged.length} en la carpeta.`;
    this.packMsg.set(msg);
    this.feedback.success(`${nuevos.length} factura(s) añadidas a «${folder.name}». Total en carpeta: ${merged.length}.`);

    this.foldersApi
      .addDocuments(folder.id, nuevos)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.aplicarCarpeta(r.folder);
          const total = r.folder.document_count || r.folder.document_ids?.length || merged.length;
          this.feedback.success(`${r.added ?? nuevos.length} factura(s) integradas en «${r.folder.name}». Total: ${total}.`);
          this.refrescarFacturas();
          this.startPoll();
        },
        error: (err) => {
          this.feedback.error(this.detalleError(
              err,
              'Las facturas se subieron pero no se pudieron vincular a la carpeta.'
            ));
          this.refrescarFacturas();
          this.startPoll();
        },
      });
    this.paso.set(1);
  }

  /** Parte por cantidad y por peso para no superar el Nginx del host (~25m). */
  private chunkFilesBySize(files: File[], maxCount: number, maxBytes: number): File[][] {
    const chunks: File[][] = [];
    let current: File[] = [];
    let bytes = 0;
    for (const file of files) {
      const nextBytes = bytes + file.size;
      if (current.length && (current.length >= maxCount || nextBytes > maxBytes)) {
        chunks.push(current);
        current = [];
        bytes = 0;
      }
      current.push(file);
      bytes += file.size;
    }
    if (current.length) {
      chunks.push(current);
    }
    return chunks;
  }

  /** Expande ZIP en el navegador para evitar 413 por archivos grandes. */
  private async expandZipsToInvoices(files: File[]): Promise<File[]> {
    const out: File[] = [];
    let zipCount = 0;
    for (const file of files) {
      if (!/\.zip$/i.test(file.name)) {
        out.push(file);
        continue;
      }
      zipCount += 1;
      this.feedback.info(`Abriendo ZIP «${file.name}» en el navegador…`);
      const { unzipSync } = await import('fflate');
      const data = new Uint8Array(await file.arrayBuffer());
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(data);
      } catch {
        throw new Error(`«${file.name}» no es un ZIP válido o está dañado.`);
      }
      let extracted = 0;
      for (const [path, bytes] of Object.entries(entries)) {
        const normalized = path.replace(/\\/g, '/');
        if (normalized.includes('__MACOSX/') || normalized.endsWith('/')) continue;
        const base = normalized.split('/').pop() || '';
        if (!base || base.startsWith('.')) continue;
        if (!/\.(jpe?g|png|pdf|webp)$/i.test(base)) continue;
        const unique =
          out.some((f) => f.name === base) ? `${base.replace(/(\.[^.]+)$/, `_${extracted}$1`)}` : base;
        out.push(
          new File([bytes.slice()], unique, {
            type: this.mimeForInvoiceName(unique),
          })
        );
        extracted += 1;
      }
      if (!extracted) {
        throw new Error(
          `El ZIP «${file.name}» no contiene facturas PDF/JPG/PNG.`
        );
      }
    }
    if (zipCount) {
      this.feedback.success(`ZIP listo: ${out.length} factura(s) para integrar.`);
    }
    return out;
  }

  private mimeForInvoiceName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
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
      this.feedback.error('Elige una carpeta para preguntar a la IA.');
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

  async copiarContramarcado(value: string, docId: number): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.copiadoId.set(docId);
      setTimeout(() => {
        if (this.copiadoId() === docId) this.copiadoId.set(null);
      }, 1600);
    } catch {
      this.feedback.error('No se pudo copiar el contramarcado.');
    }
  }

  batchIdAutobits(): number | undefined {
    const folderBatch = this.carpetaActiva()?.autobits_batch_id;
    const sessionBatch = this.autobits()?.batch?.id;
    return folderBatch ?? sessionBatch ?? undefined;
  }

  volverAAnalizarFacturas(): void {
    const folder = this.carpetaActiva();
    if (!folder?.id) {
      this.feedback.error('Elige una carpeta primero.');
      return;
    }
    if (!this.documentos().length) {
      this.feedback.error('La carpeta no tiene facturas.');
      return;
    }
    if (this.reanalizando()) return;

    const batchId = this.batchIdAutobits();
    const sinCom = this.facturasSinCom();

    if (batchId) {
      this.reanalizarConAutobits(folder, batchId, sinCom.length);
      return;
    }

    const pendientesOcr = this.facturasPendientesAnalisis();
    if (!pendientesOcr.length) {
      this.feedback.error(
        'Carga el Excel de Autobits para buscar COM en facturas sin contramarcado.'
      );
      return;
    }
    this.reanalizarOcr(pendientesOcr.map((d) => d.id));
  }

  private facturasSinCom(): DocumentSummary[] {
    return this.documentos().filter((d) => this.documentoSinCom(d));
  }

  private documentoSinCom(d: DocumentSummary): boolean {
    const com = (d.contramarcado?.com || '').trim();
    if (!com) return true;
    const upper = com.toUpperCase().replace(/\s+/g, '');
    return upper === 'COMPENDIENTE' || upper.includes('PENDIENTE');
  }

  private facturasPendientesAnalisis(): DocumentSummary[] {
    return this.documentos().filter((d) => {
      const st = (d.estado || '').toUpperCase();
      return st === 'PENDIENTE' || st === 'EN_PROCESO' || st === 'ERROR' || !d.numero_documento;
    });
  }

  private reanalizarConAutobits(
    folder: InvoiceFolder,
    batchId: number,
    sinComCount: number
  ): void {
    this.reanalizando.set(true);
    this.feedback.info(
      sinComCount
        ? `Analizando COM en Autobits para ${sinComCount} factura(s)…`
        : 'Revisando facturas sin COM contra Autobits…'
    );
    this.foldersApi
      .recontramarcado(folder.id, true, batchId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.reanalizando.set(false))
      )
      .subscribe({
        next: (res) => {
          if (res.folder) {
            this.aplicarCarpeta(res.folder);
          } else {
            this.seleccionarCarpeta(folder.id);
          }
          const msg =
            res.message ||
            `Análisis: ${res.updated} actualizada(s), ${res.skipped} omitida(s).`;
          if (res.updated > 0) {
            this.feedback.success(msg);
          } else {
            this.feedback.info(msg || 'Todas las facturas ya tienen COM.');
          }
        },
        error: (err) =>
          this.feedback.error(this.detalleError(err, 'No se pudo analizar las facturas.')),
      });
  }

  private reanalizarOcr(documentIds: number[]): void {
    this.reanalizando.set(true);
    this.feedback.info(`Reprocesando ${documentIds.length} factura(s) pendientes…`);
    this.docsApi
      .processBatch(documentIds)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.reanalizando.set(false))
      )
      .subscribe({
        next: (res) => {
          this.feedback.success(res.mensaje || `${res.queued} factura(s) en cola de análisis.`);
          this.startPoll();
        },
        error: (err) =>
          this.feedback.error(this.detalleError(err, 'No se pudo reprocesar las facturas.')),
      });
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
          this.feedback.error('No se pudieron cargar carpetas. Puedes crear una nueva.');
        },
      });
  }

  private aplicarCarpeta(folder: InvoiceFolder): void {
    const switching = this.carpetaActiva()?.id !== folder.id;
    this.folderSeq += 1;
    const seq = this.folderSeq;
    this.poll?.unsubscribe();

    this.carpetaActiva.set(folder);
    this.guardarFolderId(folder.id);
    this.idsFacturasOperacion.set([...(folder.document_ids || [])]);
    if (switching) {
      this.facturaItems.set([]);
      this.packMsg.set('');
      this.chatMsgs.set([]);
      this.crossings.set([]);
    }

    // Pintar de inmediato lo que vino en GET /folders/{id} (evita ver facturas de otra carpeta)
    this.documentos.set(this.docsFromFolderSummary(folder));

    if (folder.autobits_batch_id) {
      this.paso.set(2);
      this.cargarRecords(folder.autobits_batch_id);
    } else {
      this.paso.set(1);
      if (switching) {
        this.records.set([]);
        this.autobits.set(null);
      }
    }

    this.carpetas.update((list) => {
      const rest = list.filter((f) => f.id !== folder.id);
      return [folder, ...rest];
    });

    this.refrescarFacturas(seq);
    if ((folder.document_ids || []).length) {
      this.startPoll();
    }
  }

  private docsFromFolderSummary(folder: InvoiceFolder): DocumentSummary[] {
    return (folder.documents || []).map((d) => ({
      id: d.id,
      filename: d.filename,
      tipo: d.tipo || 'FACTURA',
      origen: 'CARGA_MANUAL',
      estado: d.estado,
      proveedor_nombre: d.proveedor_nombre || undefined,
      numero_documento: d.numero_documento || undefined,
      total: d.total ?? undefined,
      requiere_revision: !!d.requiere_revision,
      received_at: '',
      contramarcado: d.contramarcado ?? null,
    }));
  }

  private refrescarFacturas(expectedSeq?: number): void {
    const seq = expectedSeq ?? this.folderSeq;
    const folder = this.carpetaActiva();
    const folderIds = folder ? [...(folder.document_ids || [])] : null;

    this.docsApi.list({ limit: 200 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        if (seq !== this.folderSeq) {
          return;
        }
        const all = res.items || [];
        if (folderIds) {
          // Carpeta activa (aunque vacía): nunca mezclar con otras facturas
          const set = new Set(folderIds);
          this.documentos.set(all.filter((d) => set.has(d.id)));
        } else {
          this.documentos.set(all);
        }
      },
      error: () => undefined,
    });

    const batchId = folder?.autobits_batch_id || this.autobits()?.batch?.id;
    this.crossingsApi
      .list({
        limit: 200,
        batch_id: batchId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (seq !== this.folderSeq) {
            return;
          }
          const items = res.items || [];
          if (folderIds && folderIds.length) {
            const set = new Set(folderIds);
            this.crossings.set(items.filter((c) => !c.document_id || set.has(c.document_id)));
          } else if (folderIds && !folderIds.length) {
            this.crossings.set([]);
          } else {
            this.crossings.set(items);
          }
        },
        error: () => undefined,
      });
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
          this.feedback.success(`Autobits vinculado a «${updated.name}». Ya puedes cruzar o preguntar a la IA.`);
          this.startPoll();
        },
        error: () => {
          this.feedback.success('Autobits cargado, pero no se pudo vincular a la carpeta.');
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
    this.feedback.success(res.aviso || `${res.imported_rows} filas de Autobits${reused}.${linked}`);
    if (res.parse_errors?.length) {
      this.feedback.error(res.parse_errors.slice(0, 3).join(' · '));
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

  private startPoll(): void {
    this.poll?.unsubscribe();
    this.poll = interval(2000).subscribe(() => {
      const seq = this.folderSeq;
      this.refrescarFacturas(seq);
      const pending = this.documentos().some((d) =>
        ['RECIBIDO', 'PROCESANDO'].includes((d.estado || '').toUpperCase())
      );
      if (!pending && this.documentos().length) {
        this.poll?.unsubscribe();
        const batchId = this.carpetaActiva()?.autobits_batch_id || this.autobits()?.batch?.id;
        if (batchId) {
          this.crossingsApi.runMatching(batchId).subscribe({
            next: () => this.refrescarFacturas(this.folderSeq),
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
    err: {
      status?: number;
      statusText?: string;
      message?: string;
      error?: unknown;
    },
    fallback: string
  ): string {
    const status = err?.status;
    const body = err?.error;

    if (typeof body === 'string' && body.trim()) {
      const trimmed = body.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as { detail?: unknown; message?: string };
          const nested = this.formatDetail(parsed.detail ?? parsed.message);
          if (nested) return this.withStatus(status, nested);
        } catch {
          /* plain text */
        }
      }
      if (!trimmed.startsWith('<')) {
        return this.withStatus(status, trimmed);
      }
    }

    if (body && typeof body === 'object') {
      const obj = body as { detail?: unknown; message?: string; error?: string };
      const nested = this.formatDetail(obj.detail ?? obj.message ?? obj.error);
      if (nested) return this.withStatus(status, nested);
    }

    if (status === 404) {
      return (
        'Endpoint no encontrado (404). Reconstruye contabilidad + backend en el servidor: '
        + 'docker compose build contabilidad backend && docker compose up -d contabilidad backend'
      );
    }
    if (status === 413) {
      return (
        'El proxy Nginx del servidor sigue limitando el tamaño (413). '
        + 'En Ubuntu ejecuta: sudo sed -i "s/client_max_body_size.*/client_max_body_size 250m;/" '
        + '/etc/nginx/sites-available/sig && sudo nginx -t && sudo systemctl reload nginx'
      );
    }
    if (status === 502 || status === 503) {
      return (
        'Servicio Contabilidad no responde. En el servidor: '
        + 'sudo docker compose ps contabilidad && sudo docker compose up -d contabilidad'
      );
    }
    if (status === 401 || status === 403) {
      return 'Sesión sin permiso para Contabilidad. Cierra sesión y vuelve a entrar.';
    }
    if (err?.message && !err.message.startsWith('Http failure')) {
      return this.withStatus(status, err.message);
    }
    if (status) {
      return `${fallback} (HTTP ${status}${err.statusText ? ' ' + err.statusText : ''}).`;
    }
    return fallback;
  }

  private formatDetail(d: unknown): string | null {
    if (typeof d === 'string' && d.trim()) return d.trim();
    if (Array.isArray(d)) {
      const parts = d
        .map((x) => (typeof x === 'string' ? x : (x as { msg?: string })?.msg || ''))
        .filter(Boolean);
      return parts.length ? parts.join(' ') : null;
    }
    if (d && typeof d === 'object' && 'message' in d) {
      return String((d as { message: string }).message);
    }
    return null;
  }

  private withStatus(status: number | undefined, message: string): string {
    if (!status || status === 400 || status === 409) return message;
    if (message.includes(`HTTP ${status}`)) return message;
    return `${message} (HTTP ${status})`;
  }
}
