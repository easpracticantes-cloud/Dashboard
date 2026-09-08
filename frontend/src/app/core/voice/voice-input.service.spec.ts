import { afterEach, describe, expect, it } from 'vitest';
import { getSpeechRecognitionCtor } from './speech-types';
import { VoiceInputService } from './voice-input.service';

type Step =
  | { type: 'start' }
  | { type: 'error'; error: string }
  | { type: 'result'; transcript: string; isFinal?: boolean }
  | { type: 'end' }
  | { type: 'throw-start' };

class ScriptedRecognition {
  static scripts: Step[][] = [];
  static started = 0;
  static langs: string[] = [];

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: {
    resultIndex: number;
    results: Array<{ isFinal: boolean; length: number; 0: { transcript: string; confidence: number } }>;
  }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  private readonly script: Step[];

  constructor() {
    this.script = ScriptedRecognition.scripts.shift() || [{ type: 'start' }, { type: 'end' }];
  }

  start(): void {
    if (this.script[0]?.type === 'throw-start') {
      throw new Error('start failed');
    }
    ScriptedRecognition.started += 1;
    ScriptedRecognition.langs.push(this.lang);
    queueMicrotask(() => this.run());
  }

  stop(): void {
    queueMicrotask(() => this.onend?.());
  }

  abort(): void {
    queueMicrotask(() => {
      this.onerror?.({ error: 'aborted' });
      this.onend?.();
    });
  }

  private run(): void {
    for (const step of this.script) {
      if (step.type === 'start') this.onstart?.();
      if (step.type === 'error') this.onerror?.({ error: step.error });
      if (step.type === 'result') {
        this.onresult?.({
          resultIndex: 0,
          results: [
            {
              isFinal: step.isFinal !== false,
              length: 1,
              0: { transcript: step.transcript, confidence: 1 }
            }
          ]
        });
      }
      if (step.type === 'end') this.onend?.();
    }
  }
}

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
    ScriptedRecognition.scripts = [];
    ScriptedRecognition.started = 0;
    ScriptedRecognition.langs = [];
    while (restores.length) {
      restores.pop()?.();
    }
    try {
      localStorage.removeItem('eas-ave-stt-lang');
    } catch {
      /* ignore */
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
    restores.push(setSpeechCtors({ webkit: ScriptedRecognition }));
    expect(getSpeechRecognitionCtor()).toBe(ScriptedRecognition);
    expect(new VoiceInputService().supported()).toBe(true);
  });

  it('no considera dictado compatible si no hay SpeechRecognition ni webkitSpeechRecognition', () => {
    restores.push(setSpeechCtors({}));
    expect(getSpeechRecognitionCtor()).toBeNull();
    expect(new VoiceInputService().supported()).toBe(false);
  });

  it('lanza unsupported si no hay recognition', async () => {
    restores.push(setSpeechCtors({}));
    const svc = new VoiceInputService();
    await expect(svc.listen()).rejects.toThrow(/no expone la API de dictado/i);
    expect(svc.lastErrorCode()).toBe('unsupported');
  });

  it('transcribe un resultado final', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([
      { type: 'start' },
      { type: 'result', transcript: 'Ave, busca a Carlos', isFinal: true },
      { type: 'end' }
    ]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).resolves.toBe('Ave, busca a Carlos');
    expect(svc.lastErrorCode()).toBe('');
  });

  it('mapea permission denied / not-allowed', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([{ type: 'start' }, { type: 'error', error: 'not-allowed' }, { type: 'end' }]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).rejects.toThrow(/micrófono está bloqueado/i);
    expect(svc.lastErrorCode()).toBe('not-allowed');
  });

  it('mapea service-not-allowed', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([
      { type: 'start' },
      { type: 'error', error: 'service-not-allowed' },
      { type: 'end' }
    ]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).rejects.toThrow(/servicio de dictado/i);
    expect(svc.lastErrorCode()).toBe('service-not-allowed');
  });

  it('no-speech resuelve vacío con código propio', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([{ type: 'start' }, { type: 'error', error: 'no-speech' }, { type: 'end' }]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).resolves.toBe('');
    expect(svc.lastErrorCode()).toBe('no-speech');
    expect(svc.lastError()).toMatch(/No escuché nada/i);
  });

  it('audio-capture falla de forma explícita', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([{ type: 'start' }, { type: 'error', error: 'audio-capture' }, { type: 'end' }]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).rejects.toThrow(/No hay micrófono disponible/i);
    expect(svc.lastErrorCode()).toBe('audio-capture');
  });

  it('aborted cancela sin lanzar', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([{ type: 'start' }, { type: 'error', error: 'aborted' }, { type: 'end' }]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).resolves.toBe('');
  });

  it('usa el texto si network llega con transcripción', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([
      { type: 'start' },
      { type: 'result', transcript: 'busca a Carlos', isFinal: true },
      { type: 'error', error: 'network' },
      { type: 'end' }
    ]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).resolves.toBe('busca a Carlos');
  });

  it('reintenta idioma tras network y recupera', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push(
      [{ type: 'start' }, { type: 'error', error: 'network' }, { type: 'end' }],
      [{ type: 'start' }, { type: 'result', transcript: 'Ave cotiza', isFinal: true }, { type: 'end' }]
    );
    const svc = new VoiceInputService();
    await expect(svc.listen()).resolves.toBe('Ave cotiza');
    expect(ScriptedRecognition.started).toBeGreaterThanOrEqual(2);
    expect(ScriptedRecognition.langs.length).toBeGreaterThanOrEqual(2);
    expect(ScriptedRecognition.langs[0]).not.toBe(ScriptedRecognition.langs[1]);
  });

  it('network sin transcripción no culpa al backend', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push(
      [{ type: 'start' }, { type: 'error', error: 'network' }, { type: 'end' }],
      [{ type: 'start' }, { type: 'error', error: 'network' }, { type: 'end' }],
      [{ type: 'start' }, { type: 'error', error: 'network' }, { type: 'end' }],
      [{ type: 'start' }, { type: 'error', error: 'network' }, { type: 'end' }]
    );
    const svc = new VoiceInputService();
    await expect(svc.listen()).rejects.toThrow(/no con el backend de SIG-EAS|no es el servidor de SIG-EAS/i);
    expect(svc.lastErrorCode()).toBe('network');
  });

  it('start() que lanza se mapea a audio-capture', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([{ type: 'throw-start' }]);
    const svc = new VoiceInputService();
    await expect(svc.listen()).rejects.toThrow(/No hay micrófono disponible/i);
    expect(svc.lastErrorCode()).toBe('audio-capture');
  });

  it('abort() cancela un listen en curso', async () => {
    restores.push(setSpeechCtors({ speech: ScriptedRecognition }));
    ScriptedRecognition.scripts.push([{ type: 'start' }]);
    const svc = new VoiceInputService();
    const pending = svc.listen();
    await new Promise((r) => setTimeout(r, 80));
    svc.abort();
    await expect(pending).resolves.toBe('');
    expect(svc.lastErrorCode()).toBe('aborted');
  });
});
