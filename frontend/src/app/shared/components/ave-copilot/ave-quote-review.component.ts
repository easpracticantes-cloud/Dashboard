import { CurrencyPipe } from '@angular/common';
import { Component, effect, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QuoteDraft } from '../../../core/services/enterprise-ai.service';
import { downloadQuotePdf } from './quote-pdf';

@Component({
  selector: 'eas-ave-quote-review',
  standalone: true,
  imports: [FormsModule, MatIconModule, CurrencyPipe],
  templateUrl: './ave-quote-review.component.html',
  styleUrl: './ave-quote-review.component.scss'
})
export class AveQuoteReviewComponent {
  readonly draft = input.required<QuoteDraft>();
  readonly closed = output<void>();
  readonly confirmed = output<QuoteDraft>();

  readonly code = signal('');
  readonly name = signal('');
  readonly modality = signal('PRIVADO');
  readonly people = signal(2);
  readonly unitPrice = signal(0);
  readonly total = signal(0);
  readonly currency = signal('COP');
  readonly date = signal('');
  readonly pickup = signal('');
  readonly clientName = signal('');
  readonly notes = signal('');
  readonly includes = signal('');
  readonly excludes = signal('');
  readonly reviewFlag = signal(false);
  readonly reviewed = signal(false);
  readonly manualTotal = signal(false);
  readonly scale = signal<Record<string, number>>({});
  readonly downloading = signal(false);
  readonly downloadError = signal<string | null>(null);

  readonly displayTotal = computed(() => this.total() || 0);

  constructor() {
    effect(() => {
      const d = this.draft();
      this.hydrate(d);
    });
  }

  hydrate(d: QuoteDraft): void {
    this.code.set(d.code || '');
    this.name.set(d.name || '');
    this.modality.set(d.modality || 'PRIVADO');
    this.people.set(d.people || 2);
    this.unitPrice.set(Number(d.unitPrice) || 0);
    this.total.set(Number(d.total) || 0);
    this.currency.set(d.currency || 'COP');
    this.date.set(d.date || '');
    this.pickup.set(d.pickup || '');
    this.clientName.set(d.clientName || '');
    this.notes.set(d.notes || '');
    this.includes.set(d.includes || '');
    this.excludes.set(d.excludes || '');
    this.reviewFlag.set(!!d.reviewFlag);
    this.scale.set(d.priceScaleByPax || {});
    this.manualTotal.set(false);
    this.reviewed.set(false);
    this.downloadError.set(null);
  }

  onPeopleChange(value: number | string): void {
    const pax = Math.max(1, Number(value) || 1);
    this.people.set(pax);
    this.manualTotal.set(false);
    this.applyScale(pax);
  }

  onUnitChange(value: number | string): void {
    const unit = Math.max(0, Number(value) || 0);
    this.unitPrice.set(unit);
    if (!this.manualTotal()) {
      this.total.set(Math.round(unit * this.people()));
    }
  }

  onTotalChange(value: number | string): void {
    this.manualTotal.set(true);
    this.total.set(Math.max(0, Number(value) || 0));
  }

  private applyScale(pax: number): void {
    const scale = this.scale();
    const keys = Object.keys(scale)
      .map((k) => Number(k))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    let unit = this.unitPrice();
    if (keys.length) {
      if (scale[String(pax)] != null) {
        unit = Number(scale[String(pax)]);
      } else {
        const max = keys[keys.length - 1];
        if (pax > max) {
          unit = Number(scale[String(max)]);
        } else {
          const nearest = keys.reduce((best, k) =>
            Math.abs(k - pax) < Math.abs(best - pax) ? k : best
          );
          unit = Number(scale[String(nearest)]);
        }
      }
    }
    this.unitPrice.set(unit);
    this.total.set(Math.round(unit * pax));
  }

  currentDraft(): QuoteDraft {
    return {
      code: this.code().trim(),
      name: this.name().trim(),
      modality: this.modality(),
      people: this.people(),
      unitPrice: this.unitPrice(),
      total: this.total(),
      currency: this.currency(),
      date: this.date() || undefined,
      pickup: this.pickup() || undefined,
      clientName: this.clientName() || undefined,
      notes: this.notes() || undefined,
      includes: this.includes() || undefined,
      excludes: this.excludes() || undefined,
      reviewFlag: this.reviewFlag(),
      priceScaleByPax: this.scale()
    };
  }

  markReviewed(): void {
    this.reviewed.set(true);
    this.confirmed.emit(this.currentDraft());
  }

  downloadPdf(): void {
    if (this.downloading()) return;
    this.downloadError.set(null);
    this.downloading.set(true);
    try {
      downloadQuotePdf(this.currentDraft());
    } catch (err) {
      console.error('PDF download failed', err);
      this.downloadError.set('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      this.downloading.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }
}
