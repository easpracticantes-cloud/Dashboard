import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { documentTotals } from './quote-sheet.math';
import {
  type QuoteSheetDocument,
  type QuoteSheetItem,
  displayDash,
  emptyQuoteItem,
  recalcItem
} from './quote-sheet.model';
import { formatCop, formatQuoteDate, QUOTE_TEMPLATE_IMAGE } from './quote-template';

const MAX_TEMPLATE_ROWS = 5;

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

  readonly plantilla = QUOTE_TEMPLATE_IMAGE;

  /** Filas visibles sobre la plantilla (máx. 5). */
  readonly sheetRows = computed(() => {
    const items = (this.document().items || []).map(recalcItem);
    if (this.editing()) {
      return items.slice(0, MAX_TEMPLATE_ROWS);
    }
    const padded = [...items.slice(0, MAX_TEMPLATE_ROWS)];
    while (padded.length < Math.min(MAX_TEMPLATE_ROWS, Math.max(items.length, 1))) {
      padded.push({
        id: `pad-${padded.length}`,
        description: '',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        discount: 0,
        total: 0
      });
    }
    return padded.length ? padded : items.slice(0, 1);
  });

  readonly money = computed(() => documentTotals(this.document().items));
  readonly subtotalText = computed(() => formatCop(this.money().subtotal, this.document().currency));
  readonly ivaText = computed(() => formatCop(this.money().iva, this.document().currency));
  readonly totalText = computed(() => formatCop(this.money().total, this.document().currency));

  dash = displayDash;
  dateText = formatQuoteDate;

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
    if (this.document().items.length >= MAX_TEMPLATE_ROWS) {
      return;
    }
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
    return amount > 0 ? formatCop(amount, this.document().currency) : '';
  }
}
