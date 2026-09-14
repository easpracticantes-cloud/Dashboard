import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CLIENT_FIELDS,
  META_FIELDS,
  PAY_FIELDS,
  QUOTE_MAX_ROWS,
  ROW_CELLS,
  TOTAL_FIELDS,
  boxRect,
  fontCqw,
  rowCellBox,
  rowTint,
  type BoxRect,
  type FieldAlign,
  type TextFieldSpec,
  type TextKey
} from './quote-layout';
import { documentTotals } from './quote-sheet.math';
import {
  emptyQuoteItem,
  recalcItem,
  type QuoteSheetDocument,
  type QuoteSheetItem
} from './quote-sheet.model';
import { QUOTE_TEMPLATE_IMAGE, formatCop, formatQuoteDate } from './quote-template';

/** Campo de texto proyectado sobre un `[placeholder]` de la plantilla. */
interface SheetField {
  key: TextKey;
  rect: BoxRect;
  tint: string;
  align: FieldAlign;
  kind: TextFieldSpec['kind'];
  label: string;
  fs: number;
  /** Valor crudo del documento (lo que edita el input). */
  raw: string;
  /** Valor ya formateado para la vista previa. */
  text: string;
}

/** Celda de un renglón de la tabla impresa. */
interface SheetCell {
  rect: BoxRect;
  align: FieldAlign;
  fs: number;
  text: string;
}

interface SheetRow {
  index: number;
  item: QuoteSheetItem;
  tint: string;
  description: SheetCell;
  quantity: SheetCell;
  unitPrice: SheetCell;
  total: SheetCell;
  filled: boolean;
}

interface SheetTotal {
  key: string;
  rect: BoxRect;
  tint: string;
  ink: string;
  fs: number;
  bold: boolean;
  text: string;
}

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
  readonly descLineHeight = fontCqw(ROW_CELLS.description.lh);

  private readonly money = computed(() => documentTotals(this.document().items));

  readonly metaFields = computed(() => META_FIELDS.map((spec) => this.toField(spec)));
  readonly clientFields = computed(() => CLIENT_FIELDS.map((spec) => this.toField(spec)));
  readonly payFields = computed(() => PAY_FIELDS.map((spec) => this.toField(spec)));

  readonly rows = computed<SheetRow[]>(() =>
    this.slots().map((item, index) => ({
      index,
      item,
      tint: rowTint(index),
      description: this.toCell(index, 'description', item.description),
      quantity: this.toCell(index, 'quantity', this.qtyLabel(item)),
      unitPrice: this.toCell(index, 'unitPrice', this.moneyOrBlank(item.unitPrice)),
      total: this.toCell(index, 'total', this.moneyOrBlank(item.total)),
      filled: !!(item.description.trim() || item.unitPrice > 0 || item.total > 0)
    }))
  );

  /**
   * La tabla se cubre completa o no se cubre. Si hay un solo ítem cargado, dejar
   * los otros renglones con el texto "[Descripción del servicio…]" del JPG se
   * vería roto, así que en ese caso los renglones vacíos quedan limpios.
   */
  readonly tableActive = computed(() => this.editing() || this.rows().some((row) => row.filled));

  readonly totals = computed<SheetTotal[]>(() => {
    const money = this.money();
    const value: Record<string, number> = {
      subtotal: money.subtotal,
      iva: money.iva,
      grand: money.total
    };
    return TOTAL_FIELDS.map((spec) => ({
      key: spec.key,
      rect: boxRect(spec.box),
      tint: spec.tint,
      ink: spec.ink,
      fs: fontCqw(spec.fs),
      bold: spec.bold,
      text: formatCop(value[spec.key], this.document().currency)
    }));
  });

  /** Los totales solo tapan la plantilla cuando ya hay dinero que mostrar. */
  readonly showTotals = computed(() => this.editing() || this.money().total > 0);

  /** Un campo se dibuja si estamos editando o si ya tiene contenido real. */
  visible(text: string): boolean {
    return this.editing() || !!text.trim();
  }

  patchField(key: TextKey, value: string): void {
    this.documentChange.emit({ ...this.document(), [key]: value });
  }

  patchRow(index: number, partial: Partial<QuoteSheetItem>): void {
    const items = (this.document().items || []).slice(0, QUOTE_MAX_ROWS);
    while (items.length <= index) {
      items.push(blankItem());
    }
    const next = recalcItem({ ...items[index], ...partial });
    // Al describir un renglón vacío la cantidad arranca en 1 pax.
    items[index] =
      next.description.trim() && !next.quantity
        ? recalcItem({ ...next, quantity: 1, unit: next.unit || 'pax' })
        : next;
    this.documentChange.emit({ ...this.document(), items: trimTrailingBlanks(items) });
  }

  private slots(): QuoteSheetItem[] {
    const items = (this.document().items || []).slice(0, QUOTE_MAX_ROWS).map(recalcItem);
    while (items.length < QUOTE_MAX_ROWS) {
      items.push({ ...blankItem(), id: `slot-${items.length}` });
    }
    return items;
  }

  private toField(spec: TextFieldSpec): SheetField {
    const raw = String((this.document() as unknown as Record<string, unknown>)[spec.key] ?? '');
    return {
      key: spec.key,
      rect: boxRect(spec.box),
      tint: spec.tint,
      align: spec.align,
      kind: spec.kind,
      label: spec.label,
      fs: fontCqw(spec.fs),
      raw,
      text: spec.kind === 'date' ? (raw ? formatQuoteDate(raw) : '') : raw
    };
  }

  private toCell(index: number, key: keyof typeof ROW_CELLS, text: string): SheetCell {
    const spec = ROW_CELLS[key];
    return {
      rect: boxRect(rowCellBox(index, key)),
      align: spec.align,
      fs: fontCqw(spec.fs),
      text
    };
  }

  private qtyLabel(item: QuoteSheetItem): string {
    if (!item.quantity) {
      return '';
    }
    return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
  }

  private moneyOrBlank(amount: number): string {
    return amount > 0 ? formatCop(amount, this.document().currency) : '';
  }
}

/** Renglón de relleno: sin cantidad, para no pintar un "1" fantasma. */
function blankItem(): QuoteSheetItem {
  return { ...emptyQuoteItem(), quantity: 0, unit: 'pax' };
}

function trimTrailingBlanks(items: QuoteSheetItem[]): QuoteSheetItem[] {
  const out = [...items];
  while (out.length && isBlank(out[out.length - 1])) {
    out.pop();
  }
  return out.length ? out : [emptyQuoteItem()];
}

function isBlank(item: QuoteSheetItem): boolean {
  return !item.description.trim() && !item.unitPrice && !item.total;
}
