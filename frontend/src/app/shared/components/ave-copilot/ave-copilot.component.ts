import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EnterpriseAiService } from '../../../core/services/enterprise-ai.service';

interface ChatBubble {
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: string;
}

@Component({
  selector: 'eas-ave-copilot',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './ave-copilot.component.html',
  styleUrl: './ave-copilot.component.scss'
})
export class AveCopilotComponent {
  private readonly ai = inject(EnterpriseAiService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly bounce = signal(true);
  readonly messages = signal<ChatBubble[]>([
    {
      role: 'assistant',
      text: '¡Hola! Soy **Ave**, tu copiloto del SIG. Pregúntame por tours, cotizaciones, jeep, checklists o cómo usar el CRM.',
      mode: 'ANSWER'
    }
  ]);

  draft = '';
  private sessionId: string | null = null;

  readonly suggestions = [
    '¿Cuánto sale Acaime para 5 con transporte?',
    'Checklist del tour Acaime',
    '¿Jeep privado o público?',
    '¿Cómo creo una cotización?'
  ];

  toggle(): void {
    this.open.update((v) => !v);
    this.bounce.set(false);
    if (this.open()) {
      queueMicrotask(() => this.scrollBottom());
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
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', text: res.reply, mode: res.mode }
        ]);
        this.sending.set(false);
        this.scrollBottom();
      },
      error: (err) => {
        const msg =
          (err as { error?: { message?: string } })?.error?.message ||
          'No pude responder ahora. Revisa la conexión o GEMINI_API_KEY e inténtalo de nuevo.';
        this.messages.update((m) => [...m, { role: 'system', text: msg }]);
        this.sending.set(false);
        this.scrollBottom();
      }
    });
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
