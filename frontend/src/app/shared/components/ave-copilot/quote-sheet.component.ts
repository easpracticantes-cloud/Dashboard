import { Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { documentTotals } from './quote-sheet.math';
import {
  type QuoteSheetDocument,
  type QuoteSheetItem,
  displayDash,
  emptyQuoteItem,
  previewItems,
  recalcItem
} from './quote-sheet.model';
import {
  ESCUELA_AVES_COMPANY,
  formatCop,
  formatQuoteDate,
  QUOTE_FOOTER_LANDSCAPE,
  QUOTE_HERO_BIRD,
  QUOTE_LOGO
} from './quote-template';

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
  readonly bird = QUOTE_HERO_BIRD;
  readonly landscape = QUOTE_FOOTER_LANDSCAPE;

  readonly rows = computed(() => previewItems(this.document().items, this.editing()));
  readonly money = computed(() => documentTotals(this.document().items));
  readonly subtotalText = computed(() => formatCop(this.money().subtotal, this.document().currency));
  readonly ivaText = computed(() => formatCop(this.money().iva, this.document().currency));
  readonly totalText = computed(() => formatCop(this.money().total, this.document().currency));

  dash = displayDash;
  dateText = formatQuoteDate;

  nativeElement(): HTMLElement | null {
    return this.sheetRoot()?.nativeElement ?? null;
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
