import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AiQuoteService, AiQuoteSuggestion } from '../../../core/services/ai-quote.service';
import { QuoteDto } from '../../../core/services/commercial.service';

export interface AiQuoteDialogData {
  conversationId: string;
  suggestion: AiQuoteSuggestion;
}

@Component({
  selector: 'eas-ai-quote-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, CurrencyPipe],
  templateUrl: './ai-quote-dialog.component.html',
  styleUrl: './ai-quote-dialog.component.scss'
})
export class AiQuoteDialogComponent {
  private readonly aiQuote = inject(AiQuoteService);
  private readonly dialogRef = inject(MatDialogRef<AiQuoteDialogComponent>);

  readonly title = signal('');
  readonly experience = signal('');
  readonly partySize = signal(1);
  readonly amount = signal(0);
  readonly serviceDate = signal<string | null>(null);
  readonly description = signal('');

  readonly confidence = signal(0);
  readonly analyzer = signal('HEURISTICA');
  readonly highlights = signal<string[]>([]);

  readonly generating = signal(false);
  readonly downloading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly createdQuote = signal<QuoteDto | null>(null);

  constructor(@Inject(MAT_DIALOG_DATA) public data: AiQuoteDialogData) {
    const draft = data.suggestion.draft;
    this.title.set(draft.title);
    this.experience.set(draft.experience);
    this.partySize.set(draft.partySize || 1);
    this.amount.set(draft.amount || 0);
    this.serviceDate.set(draft.serviceDate);
    this.description.set(draft.description);
    this.confidence.set(draft.confidence);
    this.analyzer.set(draft.analyzer);
    this.highlights.set(draft.highlights || []);
  }

  generate(): void {
    if (this.generating()) {
      return;
    }
    this.generating.set(true);
    this.errorMessage.set(null);
    this.aiQuote
      .generateQuote(this.data.conversationId, {
        title: this.title().trim() || this.experience(),
        experience: this.experience(),
        description: this.description(),
        amount: Number(this.amount()) || 0,
        partySize: Number(this.partySize()) || 1,
        serviceDate: this.serviceDate()
      })
      .subscribe((quote) => {
        this.generating.set(false);
        if (quote) {
          this.createdQuote.set(quote);
        } else {
          this.errorMessage.set('No se pudo generar la cotización. Intenta de nuevo.');
        }
      });
  }

  downloadPdf(): void {
    const quote = this.createdQuote();
    if (!quote || this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.aiQuote.downloadPdf(quote.id).subscribe((blob) => {
      this.downloading.set(false);
      if (!blob) {
        this.errorMessage.set('No se pudo descargar el PDF.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${quote.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  close(): void {
    this.dialogRef.close(this.createdQuote());
  }
}
