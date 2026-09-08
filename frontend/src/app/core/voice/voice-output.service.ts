import { Injectable, inject, signal } from '@angular/core';
import { AppConfigService } from '../services/app-config.service';
import { AuthService } from '../services/auth.service';
import { VoiceOutputState, friendlyVoiceError, logAveVoice } from './speech-types';
import {
  PremiumVoiceStatus,
  fetchPremiumVoiceStatus,
  playStreamedResponse,
  streamPremiumSpeech
} from './premium-voice.client';

const STORAGE_KEY = 'eas-ave-voice-out';

@Injectable({ providedIn: 'root' })
export class VoiceOutputService {
  private readonly auth = inject(AuthService);
  private readonly appConfig = inject(AppConfigService);

  readonly enabled = signal(this.readEnabled());
  readonly state = signal<VoiceOutputState>('idle');
  readonly lastError = signal('');
  readonly engine = signal<'browser' | 'elevenlabs'>('browser');
  private queue: string[] = [];
  private premium: PremiumVoiceStatus | null = null;
  private probe: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private generation = 0;
  private busy = false;

  supported(): boolean {
    return this.browserSupported() || typeof Audio !== 'undefined';
  }

  isBusy(): boolean {
    return this.busy;
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
    void this.play(raw, true);
  }

  /** Continúa hablando sin cortar el turno actual (otra utterance, no un trozo de la misma respuesta). */
  enqueue(raw: string): void {
    const text = stripForSpeech(raw);
    if (!this.enabled() || !text) {
      return;
    }
    if (this.busy || this.state() === 'speaking' || this.state() === 'paused') {
      this.queue.push(text);
      return;
    }
    void this.play(text, false);
  }

  pause(): void {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      void this.audioCtx.suspend();
      this.state.set('paused');
      return;
    }
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.state.set('paused');
      return;
    }
    if (!this.browserSupported() || !window.speechSynthesis.speaking) {
      return;
    }
    window.speechSynthesis.pause();
    this.state.set('paused');
  }

  resume(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
      this.state.set('speaking');
      return;
    }
    if (this.audio && this.audio.paused && this.audio.src) {
      void this.audio.play();
      this.state.set('speaking');
      return;
    }
    if (!this.browserSupported()) {
      return;
    }
    window.speechSynthesis.resume();
    this.state.set('speaking');
  }

  stop(): void {
    this.generation += 1;
    this.busy = false;
    this.queue = [];
    this.abort?.abort();
    this.abort = null;
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.browserSupported()) {
      window.speechSynthesis.cancel();
    }
    this.state.set('idle');
  }

  private async play(raw: string, reset: boolean): Promise<void> {
    if (!this.enabled() || !raw.trim()) {
      return;
    }
    const text = stripForSpeech(raw);
    if (!text) {
      return;
    }
    if (reset) {
      this.stop();
    }
    this.busy = true;
    const gen = this.generation;
    await this.ensureStatus();
    if (gen !== this.generation) {
      return;
    }
    if (this.premium?.enabled && this.auth.token()) {
      const ok = await this.playPremium(text, gen);
      if (ok || gen !== this.generation) {
        return;
      }
      logAveVoice('tts-fallback', { provider: 'browser', reason: 'premium-failed' });
    }
    this.playBrowser(text, reset, gen);
  }

  private async playPremium(text: string, gen: number): Promise<boolean> {
    const token = this.auth.token();
    if (!token) {
      return false;
    }
    this.abort?.abort();
    const ctrl = new AbortController();
    this.abort = ctrl;
    const started = Date.now();
    try {
      this.state.set('speaking');
      this.lastError.set('');
      this.engine.set('elevenlabs');
      logAveVoice('tts-start', {
        provider: this.premium?.provider || 'elevenlabs',
        model: this.premium?.model || null,
        state: 'speaking'
      });
      const res = await streamPremiumSpeech(this.appConfig.apiBaseUrl, token, text, ctrl.signal);
      if (gen !== this.generation) {
        return true;
      }
      if (!res.ok) {
        return false;
      }
      const format = this.premium?.format || '';
      const sampleRate = this.premium?.sampleRate || 0;
      const ctx = sampleRate > 0 ? this.ensureAudioContext() : null;
      const audio = sampleRate > 0 ? null : this.ensureAudio();
      await playStreamedResponse(res, ctrl.signal, { format, sampleRate, ctx, audio });
      if (gen !== this.generation) {
        return true;
      }
      logAveVoice('tts-end', {
        provider: 'elevenlabs',
        model: this.premium?.model || null,
        latency: Date.now() - started,
        success: true
      });
      this.finishTurn(gen);
      return true;
    } catch (err) {
      if (ctrl.signal.aborted || gen !== this.generation) {
        return true;
      }
      const code = (err as Error)?.message === 'tts-blocked' ? 'tts-blocked' : 'tts-error';
      logAveVoice('tts-error', { provider: 'elevenlabs', reason: code });
      this.lastError.set(friendlyVoiceError(code));
      return false;
    }
  }

  private playBrowser(text: string, reset: boolean, gen: number): void {
    this.busy = true;
    if (!this.browserSupported()) {
      this.busy = false;
      this.state.set('error');
      this.lastError.set(friendlyVoiceError('unsupported'));
      return;
    }
    this.engine.set('browser');
    if (reset) {
      window.speechSynthesis.cancel();
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-CO';
    utter.rate = 1.0;
    utter.pitch = 0.95;
    const voice = pickSpanishVoice();
    if (voice) {
      utter.voice = voice;
    }
    utter.onstart = () => {
      if (gen !== this.generation) {
        return;
      }
      this.state.set('speaking');
      this.lastError.set('');
    };
    utter.onend = () => {
      if (gen !== this.generation) {
        return;
      }
      const next = this.queue.shift();
      if (next) {
        this.playBrowser(next, false, gen);
        return;
      }
      this.busy = false;
      if (this.state() !== 'paused') {
        this.state.set('idle');
      }
    };
    utter.onerror = (ev) => {
      if (gen !== this.generation || isIgnorableTtsError(ev.error)) {
        return;
      }
      this.busy = false;
      const blocked = ev.error === 'not-allowed';
      this.state.set('error');
      this.lastError.set(friendlyVoiceError(blocked ? 'tts-blocked' : 'tts-error'));
    };
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      this.busy = false;
      this.state.set('error');
      this.lastError.set(friendlyVoiceError('tts-blocked'));
    }
  }

  private finishTurn(gen: number): void {
    if (gen !== this.generation) {
      return;
    }
    this.busy = false;
    const next = this.queue.shift();
    if (next) {
      void this.play(next, false);
      return;
    }
    if (this.state() !== 'paused') {
      this.state.set('idle');
    }
  }

  private async ensureStatus(): Promise<void> {
    if (this.premium || this.probe) {
      await this.probe;
      return;
    }
    this.probe = fetchPremiumVoiceStatus(this.appConfig.apiBaseUrl, this.auth.token())
      .then((status) => {
        this.premium = status;
        logAveVoice('tts-status', {
          provider: status.provider,
          model: status.model,
          enabled: status.enabled
        });
      })
      .catch(() => {
        this.premium = {
          enabled: false,
          provider: 'browser',
          model: 'speechSynthesis',
          format: 'speechSynthesis',
          sampleRate: 0
        };
      })
      .finally(() => {
        this.probe = null;
      });
    await this.probe;
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    return this.audio;
  }

  private ensureAudioContext(): AudioContext {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      return this.audioCtx;
    }
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new Ctor();
    return this.audioCtx;
  }

  private browserSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
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
  const m = text.match(/^(.+?[.!?¿¡])(?:\s|$)/);
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
