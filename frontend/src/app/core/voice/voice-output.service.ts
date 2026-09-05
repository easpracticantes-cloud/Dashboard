import { Injectable, signal } from '@angular/core';
import { VoiceOutputState, friendlyVoiceError } from './speech-types';

const STORAGE_KEY = 'eas-ave-voice-out';

@Injectable({ providedIn: 'root' })
export class VoiceOutputService {
  readonly enabled = signal(this.readEnabled());
  readonly state = signal<VoiceOutputState>('idle');
  readonly lastError = signal('');

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
    this.stop();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-CO';
    utter.rate = 1;
    utter.pitch = 1;
    utter.onstart = () => {
      this.state.set('speaking');
      this.lastError.set('');
    };
    utter.onend = () => {
      if (this.state() !== 'paused') {
        this.state.set('idle');
      }
    };
    utter.onerror = (ev) => {
      const blocked = ev.error === 'not-allowed' || ev.error === 'canceled';
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
    if (!this.supported()) {
      this.state.set('idle');
      return;
    }
    window.speechSynthesis.cancel();
    this.state.set('idle');
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
