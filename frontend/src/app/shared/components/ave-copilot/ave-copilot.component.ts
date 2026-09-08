import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import {
  CopilotResponse,
  EnterpriseAiService,
  QuoteDraft
} from '../../../core/services/enterprise-ai.service';
import { AveVoiceUiState, VoiceOutputState, friendlyVoiceError } from '../../../core/voice/speech-types';
import { VoiceInputService } from '../../../core/voice/voice-input.service';
import { VoiceOutputService } from '../../../core/voice/voice-output.service';
import { AveQuoteReviewComponent } from './ave-quote-review.component';
import { moduleLabelFromUrl } from './ave-app-context';

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
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly voiceIn = inject(VoiceInputService);
  readonly voiceOut = inject(VoiceOutputService);

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;
  @ViewChild('inputEl') inputEl?: ElementRef<HTMLTextAreaElement>;

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly bounce = signal(true);
  readonly quoteDraft = signal<QuoteDraft | null>(null);
  readonly stickToBottom = signal(true);
  readonly showSuggestions = signal(true);
  readonly voiceHint = signal('');
  /** Sesión de voz continua (modo 2). No cambia el cerebro: solo vuelve a escuchar tras la respuesta. */
  readonly voiceSession = signal(this.readVoiceSession());
  private readonly routeUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  readonly moduleLabel = computed(() => moduleLabelFromUrl(this.routeUrl()));
  readonly identityCaption = computed(() => {
    const role = this.auth.currentUser()?.rol;
    const mod = this.moduleLabel();
    return role ? `${role} · ${mod}` : mod;
  });

  readonly voiceUi = computed<AveVoiceUiState>(() => {
    if (this.voiceIn.state() === 'listening') return 'listening';
    if (this.sending() || this.voiceIn.state() === 'processing') return 'processing';
    if (this.voiceOut.state() === 'speaking' || this.voiceOut.state() === 'paused') return 'speaking';
    if (this.voiceIn.state() === 'error' || this.voiceOut.state() === 'error') return 'error';
    return 'idle';
  });

  readonly voiceStatusLabel = computed(() => {
    switch (this.voiceUi()) {
      case 'listening':
        return this.voiceIn.interim() ? `Escuchando… ${this.voiceIn.interim()}` : 'Escuchando…';
      case 'processing':
        return 'Procesando…';
      case 'speaking':
        return this.voiceOut.state() === 'paused' ? 'Voz en pausa' : 'Ave está respondiendo…';
      case 'error':
        return this.voiceIn.lastError() || this.voiceOut.lastError() || this.voiceHint();
      default:
        if (this.voiceSession()) {
          return this.voiceHint() || 'Sesión continua activa';
        }
        return this.voiceHint();
    }
  });

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
  private listenBusy = false;
  private skipAutoListen = false;
  private awaitingSpeechEnd = false;
  private prevOutState: VoiceOutputState = 'idle';
  private speechWatch: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const out = this.voiceOut.state();
      const prev = this.prevOutState;
      this.prevOutState = out;
      if (!this.voiceSession() || !this.open() || this.skipAutoListen || this.listenBusy) {
        return;
      }
      if (this.awaitingSpeechEnd && prev === 'speaking' && (out === 'idle' || out === 'error')) {
        this.awaitingSpeechEnd = false;
        this.clearSpeechWatch();
        queueMicrotask(() => void this.listenForTurn());
      }
    });
  }

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
      return;
    }
    this.skipAutoListen = true;
    this.awaitingSpeechEnd = false;
    this.clearSpeechWatch();
    this.voiceIn.abort();
    this.voiceOut.stop();
  }

  newConversation(): void {
    this.abortStream?.abort();
    this.abortStream = null;
    this.skipAutoListen = true;
    this.awaitingSpeechEnd = false;
    this.clearSpeechWatch();
    this.voiceIn.abort();
    this.voiceOut.stop();
    this.voiceHint.set('');
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

  async toggleMic(): Promise<void> {
    this.voiceHint.set('');
    if (!this.voiceIn.supported()) {
      this.voiceHint.set(friendlyVoiceError('unsupported'));
      return;
    }
    if (this.voiceIn.state() === 'listening') {
      this.skipAutoListen = true;
      this.voiceIn.stop();
      return;
    }
    this.skipAutoListen = false;
    if (this.voiceOut.state() === 'speaking' || this.voiceOut.state() === 'paused') {
      this.awaitingSpeechEnd = false;
      this.voiceOut.stop();
    }
    if (this.sending()) {
      this.abortStream?.abort();
      this.abortStream = null;
      this.sending.set(false);
    }
    if (!this.open()) {
      this.open.set(true);
    }
    await this.listenForTurn();
  }

  toggleVoiceSession(): void {
    const next = !this.voiceSession();
    this.voiceSession.set(next);
    try {
      localStorage.setItem('eas-ave-voice-session', next ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.voiceHint.set(next ? 'Sesión de voz continua: encendida' : 'Sesión de voz continua: apagada');
    if (!next) {
      this.skipAutoListen = true;
      this.awaitingSpeechEnd = false;
      this.clearSpeechWatch();
    }
  }

  private async listenForTurn(): Promise<void> {
    if (this.listenBusy || this.sending() || this.voiceIn.state() === 'listening') {
      return;
    }
    if (!this.voiceIn.supported()) {
      return;
    }
    this.listenBusy = true;
    this.skipAutoListen = false;
    this.voiceOut.stop();
    try {
      const text = await this.voiceIn.listen();
      if (!text) {
        this.voiceHint.set(this.voiceIn.lastError() || 'No capturé audio. Inténtalo de nuevo.');
        this.voiceIn.reset();
        return;
      }
      this.draft = text;
      this.send();
    } catch (err) {
      this.voiceHint.set((err as Error)?.message || 'No pude usar el micrófono.');
      this.voiceIn.reset();
    } finally {
      this.listenBusy = false;
    }
  }

  toggleVoiceOut(): void {
    this.voiceOut.toggle();
    if (!this.voiceOut.enabled()) {
      this.voiceHint.set('Voz de Ave: apagada');
    } else {
      this.voiceHint.set('Voz de Ave: encendida');
    }
  }

  toggleSpeakPlayback(): void {
    if (this.voiceOut.state() === 'speaking') {
      this.voiceOut.pause();
      return;
    }
    if (this.voiceOut.state() === 'paused') {
      this.voiceOut.resume();
    }
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
    this.voiceIn.reset();
    this.scrollBottom(true);
    if (res.success !== false && res.reply) {
      this.voiceOut.speak(res.reply);
      this.armFollowUpListen();
    }
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
    this.voiceIn.reset();
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

  private armFollowUpListen(): void {
    if (!this.voiceSession() || !this.open() || this.skipAutoListen) {
      return;
    }
    this.awaitingSpeechEnd = true;
    this.clearSpeechWatch();
    this.speechWatch = setTimeout(() => {
      if (
        this.awaitingSpeechEnd &&
        this.voiceOut.state() !== 'speaking' &&
        this.voiceOut.state() !== 'paused'
      ) {
        this.awaitingSpeechEnd = false;
        void this.listenForTurn();
      }
    }, this.voiceOut.enabled() && this.voiceOut.supported() ? 1600 : 250);
  }

  private clearSpeechWatch(): void {
    if (this.speechWatch) {
      clearTimeout(this.speechWatch);
      this.speechWatch = null;
    }
  }

  private readVoiceSession(): boolean {
    try {
      return localStorage.getItem('eas-ave-voice-session') === '1';
    } catch {
      return false;
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
