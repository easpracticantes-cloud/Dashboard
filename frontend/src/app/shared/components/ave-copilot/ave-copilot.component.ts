import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  EnterpriseAiService,
  QuoteDraft
} from '../../../core/services/enterprise-ai.service';
import { AveQuoteReviewComponent } from './ave-quote-review.component';

interface ChatBubble {
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: string;
  hasQuote?: boolean;
}

@Component({
  selector: 'eas-ave-copilot',
  standalone: true,
  imports: [FormsModule, MatIconModule, AveQuoteReviewComponent],
  templateUrl: './ave-copilot.component.html',
  styleUrl: './ave-copilot.component.scss'
})
export class AveCopilotComponent {
  private readonly ai = inject(EnterpriseAiService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;
  @ViewChild('inputEl') inputEl?: ElementRef<HTMLTextAreaElement>;

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly bounce = signal(true);
  readonly quoteDraft = signal<QuoteDraft | null>(null);
  readonly messages = signal<ChatBubble[]>([
    {
      role: 'assistant',
      text:
        'Hola, soy **Ave**. Cuéntame qué necesitas como si me hablaras por WhatsApp: una cotización, una duda de un tour, jeep, proveedores o cómo mover algo en el SIG. Yo interpreto lo que quieras decir.',
      mode: 'ANSWER'
    }
  ]);

  draft = '';
  private sessionId: string | null = null;
  private lastQuote: QuoteDraft | null = null;

  readonly suggestions = [
    'Necesito cotizar Acaime para 4 personas privado',
    '¿Qué incluye el parapente?',
    'Cliente pregunta rafting para 6, ¿cuánto le digo?',
    '¿Me ayudas a responder un WhatsApp de Cócora?'
  ];

  toggle(): void {
    this.open.update((v) => !v);
    this.bounce.set(false);
    if (this.open()) {
      queueMicrotask(() => {
        this.scrollBottom();
        this.inputEl?.nativeElement?.focus();
      });
    }
  }

  useSuggestion(text: string): void {
    this.draft = text;
    this.send();
  }

  formatHtml(text: string): SafeHtml {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.sending()) {
      return;
    }
    this.draft = '';
    this.messages.update((m) => [...m, { role: 'user', text }]);
    this.sending.set(true);
    this.scrollBottom();

    this.ai.copilot(text, this.sessionId ?? undefined).subscribe({
      next: (res) => {
        this.sessionId = res.sessionId;
        const hasQuote = res.mode === 'QUOTE' && !!res.quoteDraft;
        this.messages.update((m) => [
          ...m,
          {
            role: 'assistant',
            text: res.reply,
            mode: res.mode,
            hasQuote
          }
        ]);
        if (hasQuote && res.quoteDraft) {
          this.lastQuote = res.quoteDraft;
          this.quoteDraft.set(res.quoteDraft);
        }
        this.sending.set(false);
        this.scrollBottom();
        queueMicrotask(() => this.inputEl?.nativeElement?.focus());
      },
      error: (err) => {
        const apiMsg =
          (err as { error?: { message?: string; detail?: string } })?.error?.message ||
          (err as { error?: { detail?: string } })?.error?.detail ||
          '';
        const status = (err as { status?: number })?.status;
        let hint: string;
        if (status === 401 || status === 403) {
          hint =
            apiMsg ||
            'Tu sesión expiró. Cierra sesión, entra de nuevo y vuelve a escribirme.';
        } else if (status === 404) {
          hint = 'El endpoint de Ave aún no está desplegado en el servidor.';
        } else if (status === 0) {
          hint = 'No hay conexión con el API.';
        } else {
          hint = apiMsg || 'Revisa la conexión con el servidor e intenta otra vez.';
        }
        this.messages.update((m) => [
          ...m,
          {
            role: 'system',
            text: `No pude completar la respuesta. ${hint}`
          }
        ]);
        this.sending.set(false);
        this.scrollBottom();
      }
    });
  }

  openQuoteReview(draft?: QuoteDraft | null): void {
    const d = draft || this.lastQuote;
    if (d) {
      this.quoteDraft.set({ ...d });
    }
  }

  closeQuoteReview(): void {
    this.quoteDraft.set(null);
  }

  onQuoteConfirmed(draft: QuoteDraft): void {
    this.lastQuote = draft;
    this.messages.update((m) => [
      ...m,
      {
        role: 'system',
        text: `Cotización revisada: **${draft.name}** · ${draft.people} pax · total listo para PDF.`
      }
    ]);
    this.scrollBottom();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private scrollBottom(): void {
    queueMicrotask(() => {
      const el = this.scroller?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
