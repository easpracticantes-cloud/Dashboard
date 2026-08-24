import { CurrencyPipe } from '@angular/common';
import { Component, effect, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { QuoteDraft } from '../../../core/services/enterprise-ai.service';

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
    const d = this.currentDraft();
    const money = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: d.currency || 'COP',
        maximumFractionDigits: 0
      }).format(n || 0);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cotización ${escapeHtml(d.code || 'EAS')}</title>
  <style>
    @page { margin: 18mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #14261c; margin: 0; }
    .sheet { max-width: 720px; margin: 0 auto; padding: 12px; }
    .brand { display: flex; justify-content: space-between; align-items: flex-end;
      border-bottom: 3px solid #1f4a33; padding-bottom: 12px; margin-bottom: 22px; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.02em; }
    .brand p { margin: 4px 0 0; font-size: 12px; color: #4a5c52; }
    .meta { font-size: 12px; color: #4a5c52; text-align: right; }
    h2 { font-size: 18px; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 18px 0; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7a72; }
    .value { font-size: 14px; margin-top: 2px; }
    .total { background: #f3faf5; border: 1px solid #cfe0d6; border-radius: 10px;
      padding: 14px 16px; margin-top: 8px; }
    .total strong { font-size: 22px; }
    .block { margin-top: 18px; }
    .block h3 { font-size: 13px; margin: 0 0 6px; color: #1f4a33; }
    .block p { margin: 0; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
    .foot { margin-top: 28px; font-size: 11px; color: #6b7a72; border-top: 1px solid #d8e2dc; padding-top: 10px; }
    @media print { .noprint { display: none !important; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div>
        <h1>Escuela Aves Salento</h1>
        <p>Cotización comercial · Kuara Expeditions</p>
      </div>
      <div class="meta">
        <div>${new Date().toLocaleDateString('es-CO')}</div>
        <div>Código: ${escapeHtml(d.code || '—')}</div>
      </div>
    </div>
    <h2>${escapeHtml(d.name || 'Tour')}</h2>
    <div class="grid">
      <div><div class="label">Cliente</div><div class="value">${escapeHtml(d.clientName || 'Por confirmar')}</div></div>
      <div><div class="label">Modalidad</div><div class="value">${escapeHtml(d.modality || '—')}</div></div>
      <div><div class="label">Personas</div><div class="value">${d.people ?? '—'}</div></div>
      <div><div class="label">Fecha servicio</div><div class="value">${escapeHtml(d.date || 'Por confirmar')}</div></div>
      <div><div class="label">Pickup</div><div class="value">${escapeHtml(d.pickup || 'Por confirmar')}</div></div>
      <div><div class="label">Precio / persona</div><div class="value">${money(d.unitPrice || 0)}</div></div>
    </div>
    <div class="total">
      <div class="label">Total cotizado</div>
      <strong>${money(d.total || 0)}</strong>
    </div>
    ${d.includes ? `<div class="block"><h3>Incluye</h3><p>${escapeHtml(d.includes)}</p></div>` : ''}
    ${d.excludes ? `<div class="block"><h3>No incluye</h3><p>${escapeHtml(d.excludes)}</p></div>` : ''}
    ${d.notes ? `<div class="block"><h3>Notas</h3><p>${escapeHtml(d.notes)}</p></div>` : ''}
    <div class="foot">
      Documento generado desde SIG · Ave. Verifica montos antes de enviar al cliente.
      ${d.reviewFlag ? ' · Tarifa marcada para revisión comercial.' : ''}
    </div>
    <p class="noprint" style="margin-top:20px;font-family:system-ui,sans-serif;font-size:13px">
      En el diálogo de impresión elige <strong>Guardar como PDF</strong>.
    </p>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'noopener,noreferrer,width=820,height=900');
    if (!w) {
      alert('Permite ventanas emergentes para descargar el PDF.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  close(): void {
    this.closed.emit();
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
