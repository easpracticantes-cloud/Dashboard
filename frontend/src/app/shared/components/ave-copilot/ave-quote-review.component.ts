import { Component, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QuoteDraft } from '../../../core/services/enterprise-ai.service';
import { EnterpriseAiService } from '../../../core/services/enterprise-ai.service';
import { AveUiContextService } from './ave-ui-context.service';
import { QuoteSheetComponent } from './quote-sheet.component';
import {
  QUOTE_STATUSES,
  type QuoteSheetDocument,
  type QuoteSheetStatus,
  documentToDraft,
  draftToDocument,
  emptyQuoteItem
} from './quote-sheet.model';
import { downloadQuotePdf } from './quote-pdf';
import { buildQuoteNumber, toIsoDate, addDays } from './quote-template';

const DRAFT_STORE = 'sig.ave.quote-document';

@Component({
  selector: 'eas-ave-quote-review',
  standalone: true,
  imports: [FormsModule, MatIconModule, QuoteSheetComponent],
  templateUrl: './ave-quote-review.component.html',
  styleUrl: './ave-quote-review.component.scss'
})
export class AveQuoteReviewComponent {
  private readonly uiCtx = inject(AveUiContextService);
  private readonly ai = inject(EnterpriseAiService);
  readonly draft = input.required<QuoteDraft>();
  readonly closed = output<void>();
  readonly confirmed = output<QuoteDraft>();

  readonly doc = signal<QuoteSheetDocument>(draftToDocument({}));
  readonly editing = signal(true);
  readonly reviewFlag = signal(false);
  readonly reviewed = signal(false);
  readonly saving = signal(false);
  readonly downloading = signal(false);
  readonly copied = signal(false);
  readonly toast = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly statuses = QUOTE_STATUSES;
  readonly sheet = viewChild(QuoteSheetComponent);

  constructor() {
    effect(() => {
      this.hydrate(this.draft());
    });
  }

  hydrate(d: QuoteDraft): void {
    const screen = this.uiCtx.entity()?.allowed || {};
    const stored = readStoredDraft();
    const merged: QuoteDraft = {
      ...stored,
      ...d,
      items: d.items?.length ? d.items : stored?.items,
      clientName: d.clientName || stored?.clientName || screen['cliente'] || '',
      clientPhone: d.clientPhone || stored?.clientPhone || screen['celular'] || '',
      clientEmail: d.clientEmail || stored?.clientEmail || '',
      clientCity: d.clientCity || stored?.clientCity || d.pickup || stored?.pickup || ''
    };
    this.doc.set(draftToDocument(merged));
    this.reviewFlag.set(!!merged.reviewFlag);
    this.reviewed.set(false);
    this.formError.set(null);
    this.toast.set(null);
    this.editing.set(true);
  }

  onDocumentChange(next: QuoteSheetDocument): void {
    this.doc.set(next);
    this.reviewed.set(false);
  }

  setStatus(status: QuoteSheetStatus): void {
    this.doc.set({ ...this.doc(), status });
  }

  currentDraft(): QuoteDraft {
    return documentToDraft(this.doc());
  }

  edit(): void {
    this.editing.set(true);
  }

  preview(): void {
    this.editing.set(false);
  }

  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.formError.set(null);
    this.saving.set(true);
    const draft = this.currentDraft();
    try {
      const res = await new Promise<{ document: QuoteDraft; errors: string[]; valid: boolean }>(
        (resolve, reject) => {
          this.ai.validateQuoteDocument(draft, true).subscribe({
            next: resolve,
            error: reject
          });
        }
      );
      if (!res.valid) {
        this.formError.set(res.errors.join(' '));
        this.editing.set(true);
        return;
      }
      this.doc.set(draftToDocument({ ...draft, ...res.document }));
      persistDraft(this.currentDraft());
      this.reviewed.set(true);
      this.confirmed.emit(this.currentDraft());
      this.editing.set(false);
      this.flash('Cotización guardada');
    } catch (err) {
      const local = this.localValidate(draft);
      if (local) {
        this.formError.set(local);
        this.editing.set(true);
        return;
      }
      persistDraft(draft);
      this.reviewed.set(true);
      this.confirmed.emit(draft);
      this.editing.set(false);
      if (err) {
        this.formError.set('Guardada en esta sesión. El servidor no pudo revalidar los totales.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  markReviewed(): void {
    void this.save();
  }

  async downloadPdf(): Promise<void> {
    if (this.downloading()) {
      return;
    }
    this.formError.set(null);
    this.downloading.set(true);
    const previewMode = this.editing();
    if (previewMode) {
      this.editing.set(false);
      await new Promise((r) => setTimeout(r, 80));
    }
    try {
      await downloadQuotePdf(this.doc(), this.sheet()?.nativeElement() ?? null);
      this.flash('PDF descargado');
    } catch {
      this.formError.set('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      if (previewMode) {
        this.editing.set(true);
      }
      this.downloading.set(false);
    }
  }

  async copySummary(): Promise<void> {
    const text = this.sheet()?.summaryText() || '';
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      this.flash('Resumen copiado al portapapeles');
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.formError.set('No se pudo copiar el resumen.');
    }
  }

  shareWhatsApp(): void {
    const text = this.sheet()?.summaryText() || '';
    const phone = (this.doc().clientPhone || '').replace(/\D/g, '');
    const base = phone ? `https://wa.me/57${phone.replace(/^57/, '')}` : 'https://wa.me/';
    const url = `${base}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }

  printSheet(): void {
    const wasEditing = this.editing();
    this.editing.set(false);
    setTimeout(() => {
      window.print();
      if (wasEditing) {
        this.editing.set(true);
      }
    }, 120);
  }

  resetDraft(): void {
    const issued = toIsoDate(new Date());
    this.doc.set(
      draftToDocument({
        quoteNumber: buildQuoteNumber('EAS', new Date()),
        issuedAt: issued,
        validUntil: addDays(issued, 15),
        clientName: '',
        clientNit: '',
        clientPhone: '',
        clientEmail: '',
        clientCity: '',
        advisorName: this.doc().advisorName,
        items: [emptyQuoteItem()].map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          discount: item.discount,
          total: item.total
        })),
        includes: '',
        excludes: '',
        observations: '',
        commercialConditions: '',
        status: 'DRAFT'
      })
    );
    try {
      sessionStorage.removeItem(DRAFT_STORE);
    } catch {
      // ignore
    }
    this.reviewed.set(false);
    this.formError.set(null);
    this.editing.set(true);
    this.flash('Cotización en blanco lista');
  }

  close(): void {
    persistDraft(this.currentDraft());
    this.closed.emit();
  }

  private flash(message: string): void {
    this.toast.set(message);
    setTimeout(() => {
      if (this.toast() === message) {
        this.toast.set(null);
      }
    }, 2200);
  }

  private localValidate(draft: QuoteDraft): string | null {
    if (!draft.clientName?.trim()) {
      return 'El cliente es obligatorio.';
    }
    const items = draft.items || [];
    const usable = items.filter((item) => (item.description || '').trim());
    if (!usable.length) {
      return 'Agrega al menos un producto o servicio.';
    }
    if (usable.some((item) => !item.quantity || item.quantity <= 0)) {
      return 'Las cantidades deben ser mayores a cero.';
    }
    if (usable.some((item) => (item.unitPrice || 0) < 0 || (item.discount || 0) < 0)) {
      return 'Los valores monetarios no pueden ser negativos.';
    }
    if (draft.issuedAt && draft.validUntil && draft.validUntil < draft.issuedAt) {
      return 'La vigencia debe ser posterior a la fecha de emisión.';
    }
    return null;
  }
}

function persistDraft(draft: QuoteDraft): void {
  try {
    sessionStorage.setItem(DRAFT_STORE, JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

function readStoredDraft(): QuoteDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORE);
    return raw ? (JSON.parse(raw) as QuoteDraft) : null;
  } catch {
    return null;
  }
}
