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
import { QUOTE_PACKAGE_PRESETS, itemsFromPreset, type QuotePackagePreset } from './quote-sheet.presets';
import {
  ESCUELA_AVES_COMPANY,
  addDays,
  formatCop,
  formatQuoteDate,
  QUOTE_LOGO,
  toIsoDate
} from './quote-template';

const BIRD_ART = 'assets/brand/quote-bird-illustration.svg';

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
  readonly birdArt = BIRD_ART;
  readonly presets = QUOTE_PACKAGE_PRESETS;

  readonly rows = computed(() => previewItems(this.document().items, this.editing()));
  readonly money = computed(() => documentTotals(this.document().items));
  readonly discountTotal = computed(() =>
    (this.document().items || []).reduce((sum, item) => sum + Math.max(0, Number(item.discount) || 0), 0)
  );
  readonly subtotalText = computed(() => formatCop(this.money().subtotal, this.document().currency));
  readonly ivaText = computed(() => formatCop(this.money().iva, this.document().currency));
  readonly totalText = computed(() => formatCop(this.money().total, this.document().currency));
  readonly discountText = computed(() => formatCop(this.discountTotal(), this.document().currency));
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
      items: itemsFromPreset(preset),
      includes: preset.includes || this.document().includes,
      excludes: preset.excludes || this.document().excludes
    });
  }

  extendValidity(days: number): void {
    const base = this.document().issuedAt || toIsoDate(new Date());
    this.patch({ validUntil: addDays(base, days) });
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
}
