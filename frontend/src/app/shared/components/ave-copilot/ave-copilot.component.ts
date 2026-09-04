import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CopilotResponse,
  EnterpriseAiService,
  QuoteDraft
} from '../../../core/services/enterprise-ai.service';
import { AveQuoteReviewComponent } from './ave-quote-review.component';

interface ChatBubble {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: string;
  hasQuote?: boolean;
  streaming?: boolean;
  error?: boolean;
  /** Texto del usuario asociado (para reintentar) */
  retryOf?: string;
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
  readonly stickToBottom = signal(true);
  readonly showSuggestions = signal(true);

  private readonly welcome: ChatBubble = {
    id: 'welcome',
    role: 'assistant',
    text:
      'Hola, soy **Ave**. Puedo conversar de cualquier tema y, si lo necesitas, ' +
      'ayudarte con el SIG (cotizaciones, catálogo, CRM).\n\n' +
      'Pregúntame lo que quieras.',
    mode: 'ANSWER'
  };

  readonly messages = signal<ChatBubble[]>([this.welcome]);

  draft = '';
  private sessionId: string | null = null;
  private lastQuote: QuoteDraft | null = null;
  private lastUserText = '';
  private abortStream: AbortController | null = null;

  /** Solo ejemplos de arranque — no limitan lo que se puede escribir */
  readonly suggestions = [
    'Explícame qué puedo hacer en este sistema',
    'Ayúdame a cotizar un tour',
    'Hazme un resumen claro de algo',
    '¿Qué es inteligencia artificial?'
  ];

  toggle(): void {
    this.open.update((v) => !v);
    this.bounce.set(false);
    if (this.open()) {
      queueMicrotask(() => {
        this.scrollBottom(true);
        this.inputEl?.nativeElement?.focus();
      });
    }
  }

  newConversation(): void {
    this.abortStream?.abort();
    this.abortStream = null;
    this.sessionId = null;
    this.lastQuote = null;
    this.lastUserText = '';
    this.quoteDraft.set(null);
    this.showSuggestions.set(true);
    this.sending.set(false);
    this.messages.set([{ ...this.welcome, id: 'welcome-' + Date.now() }]);
    queueMicrotask(() => this.inputEl?.nativeElement?.focus());
  }

  useSuggestion(text: string): void {
    this.draft = text;
    this.send();
  }

  formatHtml(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderMarkdownLite(text));
  }

  async copyMessage(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  retry(userText?: string): void {
    const t = (userText || this.lastUserText || '').trim();
    if (!t || this.sending()) {
      return;
    }
    this.draft = t;
    this.send();
  }

  onScroll(): void {
    const el = this.scroller?.nativeElement;
    if (!el) {
      return;
    }
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickToBottom.set(dist < 80);
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.sending()) {
      return;
    }
    this.draft = '';
    this.lastUserText = text;
    this.showSuggestions.set(false);
    const userId = uid();
    this.messages.update((m) => [...m, { id: userId, role: 'user', text }]);
    this.sending.set(true);
    this.scrollBottom(true);

    const assistantId = uid();
    this.messages.update((m) => [
      ...m,
      {
        id: assistantId,
        role: 'assistant',
        text: '',
        mode: 'ANSWER',
        streaming: true,
        retryOf: text
      }
    ]);

    this.abortStream?.abort();
    this.abortStream = new AbortController();

    this.ai
      .copilotStream(text, this.sessionId ?? undefined, {
        signal: this.abortStream.signal,
        onDelta: (delta) => {
          this.messages.update((list) =>
            list.map((b) =>
              b.id === assistantId ? { ...b, text: b.text + delta, streaming: true } : b
            )
          );
          if (this.stickToBottom()) {
            this.scrollBottom(false);
          }
        },
        onDone: (res) => this.applyDone(assistantId, res),
        onError: (msg) => this.applyError(assistantId, text, msg)
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') {
          this.sending.set(false);
          return;
        }
        // Fallback no-stream
        this.ai.copilot(text, this.sessionId ?? undefined).subscribe({
          next: (res) => this.applyDone(assistantId, res),
          error: (e) => this.applyError(assistantId, text, friendlyError(e))
        });
      });
  }

  private applyDone(assistantId: string, res: CopilotResponse): void {
    this.sessionId = res.sessionId;
    const hasQuote = res.mode === 'QUOTE' && !!res.quoteDraft;
    this.messages.update((list) =>
      list.map((b) =>
        b.id === assistantId
          ? {
              ...b,
              text: res.reply || b.text,
              mode: res.mode,
              hasQuote,
              streaming: false,
              error: res.success === false
            }
          : b
      )
    );
    if (hasQuote && res.quoteDraft) {
      this.lastQuote = res.quoteDraft;
      this.quoteDraft.set(res.quoteDraft);
    }
    this.sending.set(false);
    this.scrollBottom(true);
    queueMicrotask(() => this.inputEl?.nativeElement?.focus());
  }

  private applyError(assistantId: string, userText: string, hint: string): void {
    this.messages.update((list) =>
      list.map((b) =>
        b.id === assistantId
          ? {
              ...b,
              text: `Lo siento, tuve un problema procesando tu solicitud. ${hint}`,
              streaming: false,
              error: true,
              role: 'system',
              retryOf: userText
            }
          : b
      )
    );
    this.sending.set(false);
    this.scrollBottom(true);
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
        id: uid(),
        role: 'system',
        text: `Cotización revisada: **${draft.name}** · ${draft.people} pax · total listo para PDF.`
      }
    ]);
    this.scrollBottom(true);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private scrollBottom(force: boolean): void {
    if (!force && !this.stickToBottom()) {
      return;
    }
    queueMicrotask(() => {
      const el = this.scroller?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function friendlyError(err: unknown): string {
  const e = err as { error?: { message?: string; detail?: string }; status?: number };
  const apiMsg = e?.error?.message || e?.error?.detail || '';
  const status = e?.status;
  if (status === 401 || status === 403) {
    return apiMsg || 'Tu sesión expiró. Vuelve a iniciar sesión.';
  }
  if (status === 0) {
    return 'No hay conexión con el servidor.';
  }
  return apiMsg || 'Inténtalo nuevamente en un momento.';
}

/** Markdown ligero seguro (sin deps externas). */
function renderMarkdownLite(raw: string): string {
  const escaped = (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const out: string[] = [];
  let inCode = false;
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeLists();
      if (!inCode) {
        out.push('<pre class="ave-code"><code>');
        inCode = true;
      } else {
        out.push('</code></pre>');
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(line + '\n');
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineFmt(heading[2])}</h${level}>`);
      continue;
    }

    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inlineFmt(ul[1])}</li>`);
      continue;
    }

    const ol = /^(\d+)\.\s+(.+)$/.exec(line);
    if (ol) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inlineFmt(ol[2])}</li>`);
      continue;
    }

    closeLists();
    if (line.trim() === '') {
      out.push('<br>');
    } else {
      out.push(`<p>${inlineFmt(line)}</p>`);
    }
  }
  closeLists();
  if (inCode) {
    out.push('</code></pre>');
  }
  return out.join('');
}

function inlineFmt(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}
