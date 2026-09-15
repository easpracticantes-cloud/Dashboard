import { Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { documentTotals } from './quote-sheet.math';
import {
  type QuoteSheetDocument,
  type QuoteSheetItem,
  displayDash,
  emptyQuoteItem,
  newItemId,
  previewItems,
  recalcItem
} from './quote-sheet.model';
import { QUOTE_PACKAGE_PRESETS, itemsFromPreset, unitFromScale, type QuotePackagePreset } from './quote-sheet.presets';
import {
  ESCUELA_AVES_COMPANY,
  addDays,
  buildQuoteNumber,
  formatCop,
  formatQuoteDate,
  QUOTE_BIRD_ART,
  QUOTE_LOGO,
  toIsoDate
} from './quote-template';

const MODALITIES = ['Privado', 'Compartido', 'Grupo', 'A medida'] as const;

@Component({
  selector: 'eas-quote-sheet',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './quote-sheet.component.html',
  styleUrl: './quote-sheet.component.scss'
})
export class QuoteSheetComponent {
  readonly document = input.required<QuoteSheetDocument>();
  readonly editing = input(false);
  readonly documentChange = output<QuoteSheetDocument>();
  readonly sheetRoot = viewChild<ElementRef<HTMLElement>>('sheetRoot');

  readonly company = ESCUELA_AVES_COMPANY;
  readonly logo = QUOTE_LOGO;
  readonly birdArt = QUOTE_BIRD_ART;
  readonly presets = QUOTE_PACKAGE_PRESETS;
  readonly modalities = MODALITIES;

  readonly rows = computed(() => previewItems(this.document().items, this.editing()));
  readonly money = computed(() => documentTotals(this.document().items));
  readonly discountTotal = computed(() =>
    (this.document().items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount) || 0), 0)
  );
  readonly subtotalText = computed(() => formatCop(this.money().subtotal, this.document().currency));
  readonly ivaText = computed(() => formatCop(this.money().iva, this.document().currency));
  readonly totalText = computed(() => formatCop(this.money().total, this.document().currency));
  readonly discountText = computed(() => formatCop(this.discountTotal(), this.document().currency));
  readonly validityTone = computed(() => {
    const until = this.document().validUntil;
    if (!until) {
      return '';
    }
    const end = new Date(`${until}T23:59:59`);
    if (Number.isNaN(end.getTime())) {
      return '';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (days < 0) {
      return 'expired';
    }
    if (days <= 3) {
      return 'soon';
    }
    return 'ok';
  });
  readonly validityLabel = computed(() => {
    const until = this.document().validUntil;
    if (!until) {
      return '';
    }
    const end = new Date(`${until}T23:59:59`);
    if (Number.isNaN(end.getTime())) {
      return '';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (days < 0) {
      return 'Vencida';
    }
    if (days === 0) {
      return 'Vence hoy';
    }
    if (days === 1) {
      return '1 día restante';
    }
    return `${days} días restantes`;
  });

  dash = displayDash;
  dateText = formatQuoteDate;

  nativeElement(): HTMLElement | null {
    return this.sheetRoot()?.nativeElement ?? null;
  }

  summaryText(): string {
    const d = this.document();
    const lines = [
      `Cotización ${d.quoteNumber || ''} — Escuela Aves Salento`,
      d.clientName ? `Cliente: ${d.clientName}` : '',
      d.clientPhone ? `Tel: ${d.clientPhone}` : '',
      d.serviceDate ? `Fecha del servicio: ${formatQuoteDate(d.serviceDate)}` : '',
      d.modality ? `Modalidad: ${d.modality}` : '',
      d.people ? `Personas: ${d.people}` : '',
      d.pickup ? `Pickup: ${d.pickup}` : '',
      ...d.items
        .filter((item) => (item.description || '').trim())
        .map(
          (item, i) =>
            `${i + 1}. ${item.description.replace(/\s+/g, ' ').trim()} — ${item.quantity} ${item.unit || 'pax'} · ${formatCop(item.total, d.currency)}`
        ),
      `Total: ${formatCop(this.money().total, d.currency)} (IVA incluido)`,
      d.validUntil ? `Válida hasta: ${formatQuoteDate(d.validUntil)}` : '',
      `Contacto: ${this.company.phone}`
    ].filter(Boolean);
    return lines.join('\n');
  }

  patch(partial: Partial<QuoteSheetDocument>): void {
    this.documentChange.emit({ ...this.document(), ...partial });
  }

  patchItem(index: number, partial: Partial<QuoteSheetItem>): void {
    const items = this.document().items.map((item, i) =>
      i === index ? recalcItem({ ...item, ...partial }) : item
    );
    this.documentChange.emit({ ...this.document(), items });
  }

  addItem(): void {
    this.documentChange.emit({
      ...this.document(),
      items: [...this.document().items, emptyQuoteItem()]
    });
  }

  duplicateItem(index: number): void {
    const source = this.document().items[index];
    if (!source) {
      return;
    }
    const copy = recalcItem({ ...source, id: newItemId() });
    const items = [...this.document().items];
    items.splice(index + 1, 0, copy);
    this.documentChange.emit({ ...this.document(), items });
  }

  removeItem(index: number): void {
    const items = this.document().items.filter((_, i) => i !== index);
    this.documentChange.emit({
      ...this.document(),
      items: items.length ? items : [emptyQuoteItem()]
    });
  }

  moveItem(index: number, dir: -1 | 1): void {
    const items = [...this.document().items];
    const next = index + dir;
    if (next < 0 || next >= items.length) {
      return;
    }
    [items[index], items[next]] = [items[next], items[index]];
    this.documentChange.emit({ ...this.document(), items });
  }

  applyPreset(preset: QuotePackagePreset): void {
    this.documentChange.emit({
      ...this.document(),
      name: preset.label,
      code: preset.code || this.document().code,
      modality: preset.modality || this.document().modality,
      items: itemsFromPreset(preset),
      includes: preset.includes || this.document().includes,
      excludes: preset.excludes || this.document().excludes,
      people: preset.items[0]?.quantity || this.document().people,
      priceScaleByPax: preset.priceScaleByPax || this.document().priceScaleByPax
    });
  }

  extendValidity(days: number): void {
    const base = this.document().issuedAt || toIsoDate(new Date());
    this.patch({ validUntil: addDays(base, days) });
  }

  regenQuoteNumber(): void {
    this.patch({ quoteNumber: buildQuoteNumber(this.document().code || 'EAS', new Date()) });
  }

  setPeople(raw: number | string): void {
    const people = Math.max(1, Number(raw) || 1);
    const scaled = unitFromScale(this.document().priceScaleByPax, people);
    const items = this.document().items.map((item, i) => {
      if (i !== 0) {
        return item;
      }
      return recalcItem({
        ...item,
        quantity: people,
        unitPrice: scaled != null ? scaled : item.unitPrice
      });
    });
    this.documentChange.emit({ ...this.document(), people, items });
  }

  applyPercentDiscount(pct: number): void {
    const rate = Math.min(100, Math.max(0, pct)) / 100;
    if (!rate) {
      return;
    }
    const items = this.document().items.map((item) => {
      const gross = Math.max(0, (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
      return recalcItem({ ...item, discount: Math.round(gross * rate) });
    });
    this.documentChange.emit({ ...this.document(), items });
  }

  clearDiscounts(): void {
    const items = this.document().items.map((item) => recalcItem({ ...item, discount: 0 }));
    this.documentChange.emit({ ...this.document(), items });
  }

  qtyLabel(item: QuoteSheetItem): string {
    if (!item.quantity) {
      return '';
    }
    return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
  }

  moneyOrDash(amount: number): string {
    return amount > 0 ? formatCop(amount, this.document().currency) : '—';
  }

  descTitle(text: string): string {
    const first = (text || '').split(/\n/)[0]?.trim() || '';
    return first;
  }

  descDetail(text: string): string {
    const parts = (text || '').split(/\n/).slice(1).join('\n').trim();
    return parts;
  }
}
