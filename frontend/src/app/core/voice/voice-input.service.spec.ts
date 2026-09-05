import { afterEach, describe, expect, it } from 'vitest';
import { getSpeechRecognitionCtor } from './speech-types';
import { VoiceInputService } from './voice-input.service';

class FakeSpeechRecognition {}

function setSpeechCtors(opts: { speech?: unknown; webkit?: unknown }): () => void {
  const w = window as Window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const prevSpeech = w.SpeechRecognition;
  const prevWebkit = w.webkitSpeechRecognition;
  if (opts.speech === undefined) {
    delete w.SpeechRecognition;
  } else {
    w.SpeechRecognition = opts.speech;
  }
  if (opts.webkit === undefined) {
    delete w.webkitSpeechRecognition;
  } else {
    w.webkitSpeechRecognition = opts.webkit;
  }
  return () => {
    w.SpeechRecognition = prevSpeech;
    w.webkitSpeechRecognition = prevWebkit;
  };
}

describe('VoiceInputService', () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length) {
      restores.pop()?.();
    }
  });

  it('no se queda bloqueado tras reset', () => {
    const svc = new VoiceInputService();
    svc.reset();
    expect(svc.state()).toBe('idle');
    expect(svc.lastError()).toBe('');
  });

  it('supported() es boolean', () => {
    const svc = new VoiceInputService();
    expect(typeof svc.supported()).toBe('boolean');
  });

  it('detecta webkitSpeechRecognition sin mirar el navegador ni mediaDevices', () => {
    restores.push(setSpeechCtors({ webkit: FakeSpeechRecognition }));
    const prevMd = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    restores.push(() => {
      if (prevMd) {
        Object.defineProperty(Navigator.prototype, 'mediaDevices', prevMd);
      } else {
        delete (navigator as { mediaDevices?: unknown }).mediaDevices;
      }
    });

    expect(getSpeechRecognitionCtor()).toBe(FakeSpeechRecognition);
    expect(new VoiceInputService().supported()).toBe(true);
  });

  it('no considera dictado compatible si no hay SpeechRecognition ni webkitSpeechRecognition', () => {
    restores.push(setSpeechCtors({}));
    expect(getSpeechRecognitionCtor()).toBeNull();
    expect(new VoiceInputService().supported()).toBe(false);
  });
});
