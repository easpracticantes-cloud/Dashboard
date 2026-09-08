import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import {
  ActionExecuteResponse,
  CopilotResponse,
  EnterpriseAiService,
  QuoteDraft
} from '../../../core/services/enterprise-ai.service';
import {
  AveVoiceUiState,
  VoiceOutputState,
  backoffMsAfterSttError,
  friendlyVoiceError,
  shouldRearmWakeAfterSttError
} from '../../../core/voice/speech-types';
import { VoiceInputService } from '../../../core/voice/voice-input.service';
import { VoiceOutputService } from '../../../core/voice/voice-output.service';
import { planTtsForCopilotReply, shouldStopVoiceOnOutboundMessage } from '../../../core/voice/ave-voice-turn';
import {
  BargeInSession,
  microphoneAlreadyGranted,
  shouldArmSpeakingBargeIn,
  startSpeakingBargeIn
} from '../../../core/voice/voice-barge-in';
import {
  PendingActionConfirm,
  classifyTool,
  confirmationPrompt,
  isConfirmingThisAction,
  looksLikeCrmAction,
  requiresExplicitConfirm,
  sanitizeUserError
} from '../../../core/voice/ave-action-safety';
import { AveQuoteReviewComponent } from './ave-quote-review.component';
import { moduleLabelFromUrl } from './ave-app-context';
import {
  AveFocusItem,
  isFollowUpUtterance,
  parseFocusItems,
  readStoredSessionId,
  storeSessionId
} from './ave-thread-focus';
import { AveUiContextService } from './ave-ui-context.service';
import { AVE_COPY, stripWakePrefix } from './ave-wake';

interface AvePendingCrmAction extends PendingActionConfirm {
  instruction: string;
  contextJson: string;
}

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
  private readonly uiCtx = inject(AveUiContextService);
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
  readonly threadFocus = signal<AveFocusItem[]>([]);
  readonly pendingAction = signal<AvePendingCrmAction | null>(null);
  readonly confirmationPrompt = confirmationPrompt;
  /** Sesión de voz continua (modo 2). No cambia el cerebro: solo vuelve a escuchar tras la respuesta. */
  readonly voiceSession = signal(this.readVoiceSession());
  readonly wakeWord = signal(this.readWake());
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
    const cliente = this.uiCtx.entity()?.allowed?.['cliente']?.trim();
    const base = role ? `${role} · ${mod}` : mod;
    return cliente ? `${base} · ${cliente}` : base;
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
        if (this.wakeWord()) {
          return this.voiceHint() || 'Di «Ave» para hablar';
        }
        return this.voiceHint();
    }
  });

  private readonly welcome: ChatBubble = {
    id: 'welcome',
    role: 'assistant',
    text: AVE_COPY.welcome,
    mode: 'ANSWER'
  };

  readonly messages = signal<ChatBubble[]>([this.welcome]);

  draft = '';
  private sessionId: string | null = readStoredSessionId();
  private lastQuote: QuoteDraft | null = null;
  private lastUserText = '';
  private abortStream: AbortController | null = null;
  private listenBusy = false;
  private skipAutoListen = false;
  private awaitingSpeechEnd = false;
  private prevOutState: VoiceOutputState = 'idle';
  private speechWatch: ReturnType<typeof setTimeout> | null = null;
  private awaitingCommand = false;
  private barge: BargeInSession | null = null;
  private bargeGen = 0;
  private bargeHandOff = false;
  private bargeReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private micWasUsed = false;
  /** El navegador no despierta solo: el bucle de micrófono arranca tras un gesto (botón o abrir el panel). */
  private wakeLoopArmed = false;
  private wakeRearm: ReturnType<typeof setTimeout> | null = null;
  private sttBackoffMs = 0;

  constructor() {
    effect(() => {
      const out = this.voiceOut.state();
      const prev = this.prevOutState;
      this.prevOutState = out;
      const keepListening = this.voiceSession() || this.wakeWord() || this.awaitingCommand;
      if (!keepListening || this.skipAutoListen || this.listenBusy) {
        return;
      }
      if (!this.open() && !this.wakeWord()) {
        return;
      }
      if (
        this.awaitingSpeechEnd &&
        prev === 'speaking' &&
        (out === 'idle' || out === 'error')
      ) {
        this.awaitingSpeechEnd = false;
        this.clearSpeechWatch();
        queueMicrotask(() => void this.listenForTurn());
      }
      if (out === 'speaking') {
        void this.armSpeakingBargeIn();
      } else if (!this.bargeHandOff) {
        this.releaseSpeakingBargeIn();
      }
    });
    effect(() => {
      if (this.bargeHandOff && this.voiceIn.state() === 'listening') {
        this.releaseSpeakingBargeIn();
        this.bargeHandOff = false;
      }
    });
    this.restoreThread();
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
      if (this.wakeWord()) {
        this.wakeLoopArmed = true;
        this.skipAutoListen = false;
        queueMicrotask(() => void this.listenForTurn());
      }
      queueMicrotask(() => {
        this.scrollBottom(true);
        this.inputEl?.nativeElement?.focus();
      });
      return;
    }
    this.awaitingSpeechEnd = false;
    this.clearSpeechWatch();
    this.releaseSpeakingBargeIn();
    this.voiceOut.stop();
    if (this.wakeWord()) {
      this.skipAutoListen = false;
      this.wakeLoopArmed = true;
      queueMicrotask(() => void this.listenForTurn());
      return;
    }
    this.skipAutoListen = true;
    this.voiceIn.abort();
  }

  newConversation(): void {
    this.abortStream?.abort();
    this.abortStream = null;
    this.skipAutoListen = true;
    this.awaitingSpeechEnd = false;
    this.awaitingCommand = false;
    this.clearSpeechWatch();
    this.clearWakeRearm();
    this.releaseSpeakingBargeIn();
    this.voiceIn.abort();
    this.voiceOut.stop();
    this.voiceHint.set('');
    const previous = this.sessionId;
    if (previous) {
      this.ai.deleteMemory(previous).subscribe({ error: () => undefined });
    }
    this.sessionId = null;
    storeSessionId(null);
    this.threadFocus.set([]);
    this.pendingAction.set(null);
    this.uiCtx.clearHits();
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

  useFocus(item: AveFocusItem): void {
    const ordinals = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto'];
    this.draft = ordinals[item.index] ? `el ${ordinals[item.index]}` : item.label;
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

  toggleWake(): void {
    const next = !this.wakeWord();
    this.wakeWord.set(next);
    try {
      localStorage.setItem('eas-ave-wake', next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (next) {
      this.wakeLoopArmed = true;
      this.skipAutoListen = false;
      this.voiceHint.set('Di «Ave» para hablar. El navegador no tiene wake word nativo; el micrófono queda a la espera.');
      if (!this.open()) {
        this.open.set(true);
      }
      void this.listenForTurn();
      return;
    }
    this.wakeLoopArmed = false;
    this.awaitingCommand = false;
    this.skipAutoListen = true;
    this.clearWakeRearm();
    this.voiceIn.abort();
    this.voiceHint.set('Wake word desactivado. Usa el micrófono o la sesión continua.');
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
    this.micWasUsed = true;
    this.voiceOut.stop();
    try {
      const text = await this.voiceIn.listen();
      if (!text) {
        this.voiceHint.set(this.voiceIn.lastError() || 'No capturé audio. Inténtalo de nuevo.');
        this.voiceIn.reset();
        this.rearmAfterListen(this.voiceIn.lastErrorCode());
        return;
      }
      this.sttBackoffMs = 0;
      const parsed = stripWakePrefix(text);
      const requireWake = this.wakeWord() && !this.voiceSession() && !this.awaitingCommand;
      if (requireWake && !parsed.hadWake) {
        this.voiceHint.set('Di «Ave» y tu pedido.');
        this.rearmWakeListen();
        return;
      }
      if (parsed.wakeOnly) {
        this.ackWakeThenListen();
        return;
      }
      this.awaitingCommand = false;
      if (!this.open()) {
        this.open.set(true);
      }
      this.draft = parsed.hadWake ? parsed.message : text;
      this.send();
    } catch (err) {
      const code = this.voiceIn.lastErrorCode();
      this.voiceHint.set((err as Error)?.message || friendlyVoiceError(code || 'unknown'));
      this.voiceIn.reset();
      this.rearmAfterListen(code);
    } finally {
      this.listenBusy = false;
    }
  }

  private ackWakeThenListen(): void {
    this.open.set(true);
    this.awaitingCommand = true;
    this.bounce.set(false);
    this.messages.update((m) => [
      ...m,
      { id: uid(), role: 'assistant', text: AVE_COPY.listening, mode: 'ANSWER' }
    ]);
    this.voiceHint.set(AVE_COPY.listening);
    this.scrollBottom(true);
    if (this.voiceOut.enabled()) {
      this.voiceOut.speak(AVE_COPY.listening);
      this.awaitingSpeechEnd = true;
      this.clearSpeechWatch();
      this.speechWatch = setTimeout(() => {
        if (this.awaitingSpeechEnd && this.voiceOut.state() !== 'speaking') {
          this.awaitingSpeechEnd = false;
          void this.listenForTurn();
        }
      }, 900);
      return;
    }
    queueMicrotask(() => void this.listenForTurn());
  }

  private rearmAfterListen(errorCode: string): void {
    if (!errorCode || errorCode === 'no-speech' || errorCode === 'aborted') {
      this.rearmWakeListen();
      return;
    }
    if (!shouldRearmWakeAfterSttError(errorCode)) {
      this.sttBackoffMs = backoffMsAfterSttError(errorCode, this.sttBackoffMs);
      if (this.sttBackoffMs > 0 && this.wakeWord() && this.wakeLoopArmed && !this.skipAutoListen) {
        if (this.wakeRearm) {
          clearTimeout(this.wakeRearm);
        }
        this.wakeRearm = setTimeout(() => {
          this.wakeRearm = null;
          void this.listenForTurn();
        }, this.sttBackoffMs);
      }
      return;
    }
    this.rearmWakeListen();
  }

  private rearmWakeListen(): void {
    if (!this.wakeWord() || !this.wakeLoopArmed || this.skipAutoListen || this.sending()) {
      return;
    }
    if (this.wakeRearm) {
      clearTimeout(this.wakeRearm);
    }
    this.wakeRearm = setTimeout(() => {
      this.wakeRearm = null;
      void this.listenForTurn();
    }, 400);
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
    if (shouldStopVoiceOnOutboundMessage()) {
      this.releaseSpeakingBargeIn();
      this.voiceOut.stop();
    }
    this.draft = '';
    this.lastUserText = text;
    this.showSuggestions.set(false);
    this.messages.update((m) => [...m, { id: uid(), role: 'user', text }]);
    this.sending.set(true);
    this.scrollBottom(true);

    const pending = this.pendingAction();
    if (isConfirmingThisAction(pending, text)) {
      this.confirmPendingAction();
      return;
    }
    if (looksLikeCrmAction(text) || (this.uiCtx.hits().length > 1 && isFollowUpUtterance(text))) {
      this.runActionPreview(text);
      return;
    }

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
    const uiContext = this.uiCtx.compact();

    this.ai
      .copilotStream(text, this.sessionId ?? undefined, {
        uiContext,
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
        this.ai.copilot(text, this.sessionId ?? undefined, uiContext).subscribe({
          next: (res) => this.applyDone(assistantId, res),
          error: (e) => this.applyError(assistantId, text, friendlyError(e))
        });
      });
  }

  confirmPendingAction(): void {
    const pending = this.pendingAction();
    if (!pending) {
      return;
    }
    this.sending.set(true);
    this.ai
      .executeActions({
        instruction: pending.instruction,
        contextJson: pending.contextJson,
        dryRun: false,
        confirm: true,
        sessionId: this.ensureSessionId(),
        confirmationId: pending.confirmationId
      })
      .subscribe({
        next: (res) => {
          this.pendingAction.set(null);
          this.finishActionReply(res, false);
        },
        error: (err) => {
          this.sending.set(false);
          this.pushAveReply(`No pude ejecutar esa acción. ${friendlyError(err)}`, true);
        }
      });
  }

  dismissPendingAction(): void {
    this.pendingAction.set(null);
    this.pushAveReply(AVE_COPY.cancelled);
  }

  private runActionPreview(instruction: string): void {
    const contextJson = this.uiCtx.compact();
    this.ai
      .executeActions({
        instruction,
        contextJson,
        dryRun: true,
        confirm: false,
        sessionId: this.ensureSessionId()
      })
      .subscribe({
        next: (res) => this.finishActionReply(res, true, instruction, contextJson),
        error: (err) => {
          this.sending.set(false);
          this.pushAveReply(`No pude simular esa acción. ${friendlyError(err)}`, true);
        }
      });
  }

  private finishActionReply(
    res: ActionExecuteResponse,
    preview: boolean,
    instruction?: string,
    contextJson?: string
  ): void {
    const tools = res.plannedTools || [];
    const mainTool = tools.find((t) => requiresExplicitConfirm(classifyTool(t))) || tools[0] || '';
    const safety = classifyTool(mainTool);
    const narrative = (res.narrative || res.rationale || 'Listo.').trim();
    const token = (res.confirmationId || '').trim();
    const needsConfirm = preview && !!token && requiresExplicitConfirm(safety);
    this.captureHits(res);
    if (needsConfirm && instruction) {
      const specific =
        (res.results || []).find((r) => r.message && classifyTool(r.tool) !== 'READ_ONLY')?.message ||
        narrative;
      this.pendingAction.set({
        confirmationId: token,
        tool: mainTool,
        summary: specific.slice(0, 180),
        safety,
        instruction,
        contextJson: contextJson || '{}'
      });
    } else if (!preview) {
      this.pendingAction.set(null);
    }
    const pending = this.pendingAction();
    const suffix = needsConfirm && pending
      ? `\n\n${confirmationPrompt(pending)} Di «sí» o pulsa Confirmar.`
      : '';
    this.sending.set(false);
    this.pushAveReply(narrative + suffix);
  }

  private pushAveReply(text: string, error = false): void {
    this.messages.update((m) => [
      ...m,
      { id: uid(), role: error ? 'system' : 'assistant', text, error }
    ]);
    this.scrollBottom(true);
    if (text) {
      this.voiceOut.speak(text);
      this.armFollowUpListen();
    }
    queueMicrotask(() => this.inputEl?.nativeElement?.focus());
  }

  private ensureSessionId(): string {
    if (this.sessionId) {
      return this.sessionId;
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'ave-' + Date.now().toString(36);
    this.sessionId = id;
    storeSessionId(id);
    return id;
  }

  private captureHits(res: ActionExecuteResponse): void {
    const hits: Array<{ id: string; label: string }> = [];
    for (const step of res.results || []) {
      const raw = step.data?.['hits'];
      if (!Array.isArray(raw)) continue;
      for (const item of raw) {
        const row = item as { id?: string; label?: string };
        if (row?.id || row?.label) {
          hits.push({ id: String(row.id || ''), label: String(row.label || '') });
        }
      }
    }
    this.uiCtx.setHits(hits);
    if (res.narrative) {
      this.threadFocus.set(parseFocusItems(res.narrative));
    }
  }

  private applyDone(assistantId: string, res: CopilotResponse): void {
    this.sessionId = res.sessionId;
    storeSessionId(res.sessionId || null);
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
    const reply = res.reply || '';
    this.threadFocus.set(parseFocusItems(reply));
    if (res.success !== false && reply) {
      const [spoken] = planTtsForCopilotReply(reply);
      if (spoken) {
        this.voiceOut.speak(spoken);
      }
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
              text: `${AVE_COPY.failed} ${hint}`,
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

  private restoreThread(): void {
    const sid = this.sessionId;
    if (!sid) return;
    this.ai.memoryMessages(sid).subscribe({
      next: (msgs) => this.hydrateFromMemory(msgs || []),
      error: () => {
        this.sessionId = null;
        storeSessionId(null);
      }
    });
  }

  private hydrateFromMemory(msgs: Array<{ role?: string; content?: string }>): void {
    const bubbles: ChatBubble[] = Array.isArray(msgs)
      ? msgs
          .filter((m) => (m.content || '').trim())
          .map((m) => ({
            id: uid(),
            role: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant',
            text: m.content || ''
          }))
      : [];
    if (!bubbles.length) return;
    this.messages.set(bubbles);
    this.showSuggestions.set(false);
    const lastAve = [...bubbles].reverse().find((b) => b.role === 'assistant');
    this.threadFocus.set(parseFocusItems(lastAve?.text || ''));
    this.scrollBottom(true);
  }

  private armFollowUpListen(): void {
    if (this.skipAutoListen) {
      return;
    }
    const keep = this.voiceSession() || this.awaitingCommand || this.wakeWord();
    if (!keep || (!this.open() && !this.wakeWord())) {
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
    }, this.voiceOut.enabled() && this.voiceOut.supported() ? 700 : 150);
  }

  private async armSpeakingBargeIn(): Promise<void> {
    const gen = ++this.bargeGen;
    const granted =
      this.voiceSession() || this.wakeWord() || this.micWasUsed || (await microphoneAlreadyGranted());
    if (gen !== this.bargeGen) {
      return;
    }
    if (
      !shouldArmSpeakingBargeIn({
        speaking: this.voiceOut.state() === 'speaking',
        alreadyListening: this.voiceIn.state() === 'listening',
        micGranted: granted
      })
    ) {
      return;
    }
    this.barge?.release();
    this.barge = startSpeakingBargeIn(() => this.onUserBargeIn());
  }

  private onUserBargeIn(): void {
    if (this.bargeHandOff || this.listenBusy || this.voiceIn.state() === 'listening') {
      return;
    }
    this.bargeHandOff = true;
    this.barge?.stopDetection();
    this.awaitingSpeechEnd = false;
    this.skipAutoListen = false;
    this.voiceOut.stop();
    if (this.sending()) {
      this.abortStream?.abort();
      this.abortStream = null;
      this.sending.set(false);
    }
    void this.listenForTurn();
    if (this.bargeReleaseTimer) {
      clearTimeout(this.bargeReleaseTimer);
    }
    this.bargeReleaseTimer = setTimeout(() => {
      this.bargeReleaseTimer = null;
      if (this.bargeHandOff) {
        this.releaseSpeakingBargeIn();
        this.bargeHandOff = false;
      }
    }, 900);
  }

  private releaseSpeakingBargeIn(): void {
    this.bargeGen += 1;
    if (this.bargeReleaseTimer) {
      clearTimeout(this.bargeReleaseTimer);
      this.bargeReleaseTimer = null;
    }
    this.barge?.release();
    this.barge = null;
  }

  private clearSpeechWatch(): void {
    if (this.speechWatch) {
      clearTimeout(this.speechWatch);
      this.speechWatch = null;
    }
  }

  private clearWakeRearm(): void {
    if (this.wakeRearm) {
      clearTimeout(this.wakeRearm);
      this.wakeRearm = null;
    }
  }

  private readVoiceSession(): boolean {
    try {
      return localStorage.getItem('eas-ave-voice-session') === '1';
    } catch {
      return false;
    }
  }

  private readWake(): boolean {
    try {
      return localStorage.getItem('eas-ave-wake') === '1';
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
  const e = err as { error?: { message?: string; detail?: string }; status?: number; message?: string };
  const apiMsg = e?.error?.message || e?.error?.detail || '';
  const status = e?.status;
  if (status === 401 || status === 403) {
    return sanitizeUserError(apiMsg || 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }
  if (status === 0) {
    return 'No hay conexión con el servidor.';
  }
  return sanitizeUserError(apiMsg || e?.message || 'Inténtalo nuevamente en un momento.');
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
