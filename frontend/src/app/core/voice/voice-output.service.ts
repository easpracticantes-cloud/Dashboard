import { Injectable, signal } from '@angular/core';
import { VoiceOutputState, friendlyVoiceError } from './speech-types';

const STORAGE_KEY = 'eas-ave-voice-out';

@Injectable({ providedIn: 'root' })
export class VoiceOutputService {
  readonly enabled = signal(this.readEnabled());
  readonly state = signal<VoiceOutputState>('idle');
  readonly lastError = signal('');
  private queue: string[] = [];

  supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  setEnabled(on: boolean): void {
    this.enabled.set(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!on) {
      this.stop();
    }
  }

  toggle(): void {
    this.setEnabled(!this.enabled());
  }

  speak(raw: string): void {
    this.queue = [];
    this.play(raw, true);
  }

  /** Continúa hablando sin cortar el turno actual (respuesta incremental). */
  enqueue(raw: string): void {
    const text = stripForSpeech(raw);
    if (!this.enabled() || !text) {
      return;
    }
    if (this.state() === 'speaking' || this.state() === 'paused') {
      this.queue.push(text);
      return;
    }
    this.play(text, false);
  }

  pause(): void {
    if (!this.supported() || !window.speechSynthesis.speaking) {
      return;
    }
    window.speechSynthesis.pause();
    this.state.set('paused');
  }

  resume(): void {
    if (!this.supported()) {
      return;
    }
    window.speechSynthesis.resume();
    this.state.set('speaking');
  }

  stop(): void {
    this.queue = [];
    if (!this.supported()) {
      this.state.set('idle');
      return;
    }
    window.speechSynthesis.cancel();
    this.state.set('idle');
  }

  private play(raw: string, reset: boolean): void {
    if (!this.enabled() || !raw.trim()) {
      return;
    }
    if (!this.supported()) {
      this.state.set('error');
      this.lastError.set(friendlyVoiceError('unsupported'));
      return;
    }
    const text = stripForSpeech(raw);
    if (!text) {
      return;
    }
    if (reset) {
      window.speechSynthesis.cancel();
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-CO';
    utter.rate = 1.08;
    utter.pitch = 1;
    const voice = pickSpanishVoice();
    if (voice) {
      utter.voice = voice;
    }
    utter.onstart = () => {
      this.state.set('speaking');
      this.lastError.set('');
    };
    utter.onend = () => {
      const next = this.queue.shift();
      if (next) {
        this.play(next, false);
        return;
      }
      if (this.state() !== 'paused') {
        this.state.set('idle');
      }
    };
    utter.onerror = (ev) => {
      if (isIgnorableTtsError(ev.error)) {
        return;
      }
      const blocked = ev.error === 'not-allowed';
      this.state.set('error');
      this.lastError.set(friendlyVoiceError(blocked ? 'tts-blocked' : 'tts-error'));
    };
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      this.state.set('error');
      this.lastError.set(friendlyVoiceError('tts-blocked'));
    }
  }

  private readEnabled(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === null ? true : raw === '1';
    } catch {
      return true;
    }
  }
}

export function isIgnorableTtsError(error: string): boolean {
  return error === 'canceled' || error === 'interrupted';
}

export function stripForSpeech(raw: string): string {
  return (raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/#{1,3}\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstSentence(raw: string): string {
  const text = stripForSpeech(raw);
  const m = text.match(/^(.+?[.!?])(?:\s|$)/);
  return m ? m[1].trim() : '';
}

export function remainderAfterFirstSentence(raw: string): string {
  const text = stripForSpeech(raw);
  const first = firstSentence(text);
  if (!first) return '';
  return text.slice(first.length).trim();
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis?.getVoices) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /^es-CO/i.test(v.lang)) ||
    voices.find((v) => /^es-419/i.test(v.lang)) ||
    voices.find((v) => /^es/i.test(v.lang)) ||
    null
  );
}
