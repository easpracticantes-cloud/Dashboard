import { Injectable, signal } from '@angular/core';
import {
  SpeechRecognitionLike,
  VoiceInputState,
  friendlyVoiceError,
  getSpeechRecognitionCtor,
  logAveVoice,
  rememberSttLang,
  speechRecognitionCtorName,
  sttLangCandidates,
  detectBrowserLabel
} from './speech-types';

export interface VoiceTranscript {
  text: string;
  interim: string;
}

@Injectable({ providedIn: 'root' })
export class VoiceInputService {
  readonly state = signal<VoiceInputState>('idle');
  readonly interim = signal('');
  readonly lastError = signal('');
  readonly lastErrorCode = signal('');

  private recognition: SpeechRecognitionLike | null = null;
  private finalText = '';
  private resolveListen: ((text: string) => void) | null = null;
  private rejectListen: ((err: Error) => void) | null = null;
  private pendingError = '';
  private started = false;
  private cancelled = false;
  private sessionGen = 0;

  supported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  /**
   * No se llama getUserMedia+stop() antes del dictado: cortar el stream
   * y arrancar SpeechRecognition suele disparar error `network` en Chromium.
   * SpeechRecognition pide el micrófono por su cuenta.
   */
  async listen(lang = 'es-CO'): Promise<string> {
    if (!this.supported()) {
      this.fail('unsupported');
      throw new Error(friendlyVoiceError('unsupported'));
    }
    this.cancelled = false;
    this.stopInternal(false);
    await settle(60);

    const langs = sttLangCandidates(lang);
    logAveVoice('listen', {
      browser: detectBrowserLabel(),
      ctor: speechRecognitionCtorName(),
      langs: langs.join(','),
      preferred: lang,
      recognitionAvailable: true
    });

    let lastNetwork: Error | null = null;
    for (let i = 0; i < langs.length; i++) {
      if (this.cancelled) {
        return '';
      }
      const nextLang = langs[i];
      try {
        const text = await this.listenOnce(nextLang);
        if (text) {
          rememberSttLang(nextLang);
        }
        return text;
      } catch (err) {
        const code = this.lastErrorCode();
        if (this.cancelled || code === 'aborted') {
          return '';
        }
        if (code !== 'network') {
          throw err;
        }
        lastNetwork = err as Error;
        const next = langs[i + 1];
        if (!next) {
          break;
        }
        logAveVoice('retry', {
          reason: 'network',
          fromLang: nextLang,
          nextLang: next,
          ctor: speechRecognitionCtorName()
        });
        await settle(220);
      }
    }
    this.fail('network');
    throw lastNetwork || new Error(friendlyVoiceError('network'));
  }

  stop(): void {
    this.stopInternal(true);
  }

  abort(): void {
    this.cancelled = true;
    this.sessionGen++;
    try {
      this.recognition?.abort();
    } catch {
      /* ignore */
    }
    this.recognition = null;
    this.interim.set('');
    this.lastErrorCode.set('aborted');
    this.lastError.set(friendlyVoiceError('aborted'));
    this.finish('');
    this.reset();
  }

  reset(): void {
    if (this.state() !== 'listening') {
      this.state.set('idle');
    }
  }

  private listenOnce(lang: string): Promise<string> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.fail('unsupported');
      return Promise.reject(new Error(friendlyVoiceError('unsupported')));
    }

    this.finalText = '';
    this.interim.set('');
    this.lastError.set('');
    this.lastErrorCode.set('');
    this.pendingError = '';
    this.started = false;
    this.state.set('listening');
    const gen = ++this.sessionGen;

    return new Promise<string>((resolve, reject) => {
      this.resolveListen = resolve;
      this.rejectListen = reject;
      const rec = new Ctor();
      this.recognition = rec;
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        if (gen !== this.sessionGen) return;
        this.started = true;
        this.state.set('listening');
        logAveVoice('start', {
          lang,
          ctor: speechRecognitionCtorName(),
          browser: detectBrowserLabel(),
          state: this.state()
        });
      };
      rec.onresult = (event) => {
        if (gen !== this.sessionGen) return;
        let interim = '';
        let finals = this.finalText;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finals = `${finals} ${piece}`.trim();
          } else {
            interim += piece;
          }
        }
        this.finalText = finals;
        this.interim.set(interim.trim());
      };
      rec.onerror = (event) => {
        if (gen !== this.sessionGen) return;
        const code = event.error || 'unknown';
        logAveVoice('error', {
          error: code,
          lang,
          started: this.started,
          ctor: speechRecognitionCtorName(),
          browser: detectBrowserLabel(),
          state: this.state()
        });
        if (code === 'aborted') {
          return;
        }
        this.pendingError = code;
      };
      rec.onend = () => {
        if (gen !== this.sessionGen) return;
        const spoken = (this.finalText || this.interim()).trim();
        this.interim.set('');
        logAveVoice('end', {
          lang,
          started: this.started,
          ended: true,
          hadSpeech: !!spoken,
          error: this.pendingError || null,
          ctor: speechRecognitionCtorName(),
          state: this.state()
        });
        if (spoken && (!this.pendingError || recoverableWithTranscript(this.pendingError))) {
          this.pendingError = '';
          this.finish(spoken);
          return;
        }
        if (this.state() === 'error') {
          return;
        }
        if (!this.pendingError || this.pendingError === 'no-speech' || this.pendingError === 'aborted') {
          if (this.pendingError === 'no-speech') {
            this.lastErrorCode.set('no-speech');
            this.lastError.set(friendlyVoiceError('no-speech'));
          }
          this.finish(spoken);
          return;
        }
        this.fail(this.pendingError);
        this.rejectListen?.(new Error(friendlyVoiceError(this.pendingError)));
        this.clearWaiters();
      };

      try {
        rec.start();
      } catch {
        this.fail('audio-capture');
        reject(new Error(friendlyVoiceError('audio-capture')));
        this.clearWaiters();
      }
    });
  }

  private stopInternal(userStop: boolean): void {
    this.sessionGen++;
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    this.recognition = null;
    if (this.resolveListen) {
      const resolve = this.resolveListen;
      this.clearWaiters();
      resolve('');
    }
    if (userStop && this.state() === 'listening' && !this.finalText && !this.interim()) {
      this.lastErrorCode.set('aborted');
      this.lastError.set(friendlyVoiceError('aborted'));
    }
  }

  private finish(text: string): void {
    const resolve = this.resolveListen;
    this.clearWaiters();
    if (this.state() !== 'error') {
      this.state.set(text ? 'processing' : 'idle');
    }
    resolve?.(text);
  }

  private fail(code: string): void {
    this.state.set('error');
    this.lastErrorCode.set(code);
    this.lastError.set(friendlyVoiceError(code));
    this.recognition = null;
  }

  private clearWaiters(): void {
    this.resolveListen = null;
    this.rejectListen = null;
  }
}

function recoverableWithTranscript(code: string): boolean {
  return code === 'network' || code === 'no-speech' || code === 'aborted';
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
