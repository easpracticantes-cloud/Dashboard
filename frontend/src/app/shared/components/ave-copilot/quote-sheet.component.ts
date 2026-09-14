import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { documentTotals } from './quote-sheet.math';
import {
  type QuoteSheetDocument,
  type QuoteSheetItem,
  emptyQuoteItem,
  newItemId,
  recalcItem
} from './quote-sheet.model';
import { formatCop, formatQuoteDate, QUOTE_TEMPLATE_IMAGE } from './quote-template';

const MAX_ROWS = 5;

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

  /** Siempre 5 filas alineadas a la plantilla. */
  readonly sheetRows = computed(() => {
    const raw = (this.document().items || []).map(recalcItem).slice(0, MAX_ROWS);
    const rows = [...raw];
    while (rows.length < MAX_ROWS) {
      rows.push({
        id: `pad-${rows.length}`,
        description: '',
        quantity: 0,
        unit: 'pax',
        unitPrice: 0,
        discount: 0,
        total: 0
      });
    }
    return rows;
  });

  readonly money = computed(() => documentTotals(this.document().items));
  readonly subtotalText = computed(() => formatCop(this.money().subtotal, this.document().currency));
  readonly ivaText = computed(() => formatCop(this.money().iva, this.document().currency));
  readonly totalText = computed(() => formatCop(this.money().total, this.document().currency));
  readonly hasMoney = computed(() => this.money().total > 0);

  dateText = formatQuoteDate;

  display(value?: string | null): string {
    const v = (value || '').trim();
    return v && v !== '—' ? v : '';
  }

  patch(partial: Partial<QuoteSheetDocument>): void {
    this.documentChange.emit({ ...this.document(), ...partial });
  }

  patchItem(index: number, partial: Partial<QuoteSheetItem>): void {
    const current = [...(this.document().items || [])];
    while (current.length <= index) {
      current.push(emptyQuoteItem());
    }
    // ensure real ids for previously padded slots
    const base = current[index].id?.startsWith('pad-')
      ? { ...emptyQuoteItem(), ...current[index], id: newItemId() }
      : current[index];
    current[index] = recalcItem({ ...base, ...partial });
    this.documentChange.emit({ ...this.document(), items: current.filter((item, i) => i < MAX_ROWS) });
  }

  qtyLabel(item: QuoteSheetItem): string {
    if (!item.quantity) {
      return '';
    }
    return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
  }

  moneyOrEmpty(amount: number): string {
    return amount > 0 ? formatCop(amount, this.document().currency) : '';
  }
}
