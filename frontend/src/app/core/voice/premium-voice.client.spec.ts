import { describe, expect, it, vi } from 'vitest';
import {
  concatBytes,
  fetchPremiumVoiceStatus,
  int16LeToFloat32,
  pcmSampleRateFromFormat,
  playPcmStream,
  resampleLinear,
  streamPremiumSpeech
} from './premium-voice.client';

describe('premium-voice.client', () => {
  it('sin token usa fallback de navegador', async () => {
    const status = await fetchPremiumVoiceStatus('http://x', null);
    expect(status.enabled).toBe(false);
    expect(status.provider).toBe('browser');
    expect(status.format).toBe('speechSynthesis');
  });

  it('lee status premium sin exponer secretos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: true,
          provider: 'kokoro',
          model: 'kokoro',
          format: 'pcm_24000',
          sampleRate: 24000
        })
      })
    );
    try {
      const status = await fetchPremiumVoiceStatus('http://x', 'jwt-not-logged');
      expect(status).toEqual({
        enabled: true,
        provider: 'kokoro',
        model: 'kokoro',
        format: 'pcm_24000',
        sampleRate: 24000
      });
      expect(JSON.stringify(status)).not.toMatch(/apiKey|xi-api|sk_/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('status HTTP fallido degrada a browser', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    try {
      const status = await fetchPremiumVoiceStatus('http://x', 't');
      expect(status.enabled).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('conoce el formato PCM conversacional', () => {
    expect(pcmSampleRateFromFormat('pcm_24000')).toBe(24000);
    expect(pcmSampleRateFromFormat('mp3_44100_128')).toBe(0);
    const pcm = int16LeToFloat32(new Uint8Array([0, 64, 0, 0]));
    expect(pcm.length).toBe(2);
    expect(resampleLinear(pcm, 24000, 24000)).toBe(pcm);
    expect(concatBytes(new Uint8Array([1]), new Uint8Array([2]))).toEqual(new Uint8Array([1, 2]));
  });

  it('el frontend llama al backend propio, nunca a un TTS externo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await streamPremiumSpeech('http://api.sig', 'jwt', 'Hola', new AbortController().signal);
      const url = String(fetchImpl.mock.calls[0][0]);
      expect(url).toBe('http://api.sig/ai/voice/tts/stream');
      expect(url).not.toMatch(/elevenlabs\.io/);
      const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Bearer /);
      expect(JSON.stringify(headers)).not.toMatch(/xi-api-key|ELEVENLABS/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('playPcmStream aborta sin esperar el cuerpo completo', async () => {
    const started: number[] = [];
    const ctx = {
      sampleRate: 24000,
      currentTime: 0,
      destination: {},
      createBuffer: (_c: number, len: number, rate: number) => {
        const data = new Float32Array(len);
        return { duration: len / rate, getChannelData: () => data };
      },
      createBufferSource: () => ({
        buffer: null,
        connect() {},
        start() {
          started.push(Date.now());
        },
        stop() {}
      })
    };
    let pull = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pull += 1;
        controller.enqueue(new Uint8Array(2400));
        if (pull > 8) {
          controller.close();
        }
      }
    });
    const ctrl = new AbortController();
    const play = playPcmStream(body, ctrl.signal, 24000, ctx);
    await new Promise((r) => setTimeout(r, 5));
    ctrl.abort();
    await play;
    expect(started.length).toBeGreaterThan(0);
  });
});
