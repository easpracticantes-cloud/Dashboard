import { Injectable, signal } from '@angular/core';
import {
  SpeechRecognitionLike,
  VoiceInputState,
  friendlyVoiceError,
  getSpeechRecognitionCtor,
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

  private recognition: SpeechRecognitionLike | null = null;
  private finalText = '';
  private resolveListen: ((text: string) => void) | null = null;
  private rejectListen: ((err: Error) => void) | null = null;

  supported(): boolean {
    return getSpeechRecognitionCtor() !== null && !!navigator.mediaDevices?.getUserMedia;
  }

  async listen(lang = 'es-CO'): Promise<string> {
    if (!this.supported()) {
      this.fail('unsupported');
      throw new Error(friendlyVoiceError('unsupported'));
    }
    this.stopInternal(false);
    this.finalText = '';
    this.interim.set('');
    this.lastError.set('');
    this.state.set('listening');

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
      });
    } catch {
      this.fail('denied');
      throw new Error(friendlyVoiceError('denied'));
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.fail('unsupported');
      throw new Error(friendlyVoiceError('unsupported'));
    }

    return new Promise<string>((resolve, reject) => {
      this.resolveListen = resolve;
      this.rejectListen = reject;
      const rec = new Ctor();
      this.recognition = rec;
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => this.state.set('listening');
      rec.onresult = (event) => {
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
        if (event.error === 'aborted') {
          this.finish('');
          return;
        }
        this.fail(event.error);
        this.rejectListen?.(new Error(friendlyVoiceError(event.error)));
        this.clearWaiters();
      };
      rec.onend = () => {
        const text = (this.finalText || this.interim()).trim();
        this.interim.set('');
        if (this.state() === 'error') {
          return;
        }
        this.finish(text);
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

  stop(): void {
    this.stopInternal(true);
  }

  abort(): void {
    try {
      this.recognition?.abort();
    } catch {
      /* ignore */
    }
    this.recognition = null;
    this.interim.set('');
    this.finish('');
    this.reset();
  }

  reset(): void {
    if (this.state() !== 'listening') {
      this.state.set('idle');
    }
  }

  private stopInternal(userStop: boolean): void {
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    this.recognition = null;
    if (userStop && this.state() === 'listening' && !this.finalText && !this.interim()) {
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
    this.lastError.set(friendlyVoiceError(code));
    this.recognition = null;
  }

  private clearWaiters(): void {
    this.resolveListen = null;
    this.rejectListen = null;
  }
}
