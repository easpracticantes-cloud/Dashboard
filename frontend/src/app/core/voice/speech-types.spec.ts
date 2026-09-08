import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backoffMsAfterSttError,
  detectBrowserLabel,
  friendlyVoiceError,
  getSpeechRecognitionCtor,
  isVoiceDebugEnabled,
  logAveVoice,
  shouldRearmWakeAfterSttError,
  speechRecognitionCtorName,
  sttLangCandidates
} from './speech-types';

describe('friendlyVoiceError', () => {
  it('diferencia not-allowed, service-not-allowed, network, no-speech, audio-capture, aborted y unknown', () => {
    expect(friendlyVoiceError('not-allowed')).toMatch(/micrófono está bloqueado/i);
    expect(friendlyVoiceError('denied')).toMatch(/permiso/i);
    expect(friendlyVoiceError('no-speech')).toMatch(/No escuché nada/i);
    expect(friendlyVoiceError('audio-capture')).toMatch(/micrófono disponible/i);
    expect(friendlyVoiceError('aborted')).toMatch(/Detuviste/i);
    expect(friendlyVoiceError('network')).not.toMatch(/Falló la transcripción \(red\)/);
    expect(friendlyVoiceError('network')).toMatch(/no.*backend de SIG-EAS|no es el servidor de SIG-EAS/i);
    expect(friendlyVoiceError('service-not-allowed')).toMatch(/servicio de dictado/i);
    expect(friendlyVoiceError('unknown-xyz')).toMatch(/escribir o reintentar/i);
  });
});

describe('stt policy', () => {
  it('no rearma wake de inmediato tras network o permiso', () => {
    expect(shouldRearmWakeAfterSttError('no-speech')).toBe(true);
    expect(shouldRearmWakeAfterSttError('aborted')).toBe(true);
    expect(shouldRearmWakeAfterSttError('network')).toBe(false);
    expect(shouldRearmWakeAfterSttError('not-allowed')).toBe(false);
    expect(shouldRearmWakeAfterSttError('service-not-allowed')).toBe(false);
    expect(shouldRearmWakeAfterSttError('audio-capture')).toBe(false);
  });

  it('hace backoff solo en network/service-not-allowed', () => {
    expect(backoffMsAfterSttError('no-speech')).toBe(0);
    expect(backoffMsAfterSttError('network')).toBe(2000);
    expect(backoffMsAfterSttError('network', 2000)).toBe(4000);
    expect(backoffMsAfterSttError('network', 8000)).toBe(8000);
  });

  it('propone idiomas de fallback sin duplicar', () => {
    const langs = sttLangCandidates('es-CO');
    expect(langs[0]).toBeTruthy();
    expect(new Set(langs).size).toBe(langs.length);
    expect(langs).toContain('es-CO');
    expect(langs).toContain('es-ES');
  });
});

describe('voice diagnostics', () => {
  it('detecta constructor y no registra secretos', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      localStorage.setItem('eas-ave-voice-debug', '1');
      expect(isVoiceDebugEnabled()).toBe(true);
      logAveVoice('error', { error: 'network', jwt: 'secret', transcript: 'Carlos' });
      expect(spy).toHaveBeenCalled();
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain('secret');
      expect(logged).not.toContain('Carlos');
      expect(logged).toContain('network');
      expect(typeof detectBrowserLabel()).toBe('string');
      expect(['SpeechRecognition', 'webkitSpeechRecognition', null]).toContain(speechRecognitionCtorName());
    } finally {
      localStorage.removeItem('eas-ave-voice-debug');
      spy.mockRestore();
    }
  });
});

describe('getSpeechRecognitionCtor', () => {
  afterEach(() => {
    const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });

  it('devuelve webkit si es el único disponible', () => {
    class Fake {}
    (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = Fake;
    expect(getSpeechRecognitionCtor()).toBe(Fake);
    expect(speechRecognitionCtorName()).toBe('webkitSpeechRecognition');
  });

  it('es null si no hay API', () => {
    expect(getSpeechRecognitionCtor()).toBeNull();
  });
});
