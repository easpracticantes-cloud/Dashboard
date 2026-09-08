import { logAveVoice } from './speech-types';

export interface PremiumVoiceStatus {
  enabled: boolean;
  provider: string;
  model: string;
  format: string;
  sampleRate: number;
}

export interface PcmAudioContext {
  readonly sampleRate: number;
  readonly currentTime: number;
  destination: unknown;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ): { duration: number; getChannelData(channel: number): Float32Array };
  createBufferSource(): {
    buffer: unknown;
    connect(dest: unknown): void;
    start(when?: number): void;
    stop(): void;
  };
}

export async function fetchPremiumVoiceStatus(
  apiBase: string,
  token: string | null
): Promise<PremiumVoiceStatus> {
  if (!token) {
    return browserStatus();
  }
  const res = await fetch(`${apiBase}/ai/voice/status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    return browserStatus();
  }
  const json = (await res.json()) as Partial<PremiumVoiceStatus>;
  return {
    enabled: !!json.enabled,
    provider: json.provider || 'browser',
    model: json.model || 'speechSynthesis',
    format: json.format || 'speechSynthesis',
    sampleRate: Number(json.sampleRate) || pcmSampleRateFromFormat(String(json.format || ''))
  };
}

export async function streamPremiumSpeech(
  apiBase: string,
  token: string,
  text: string,
  signal: AbortSignal
): Promise<Response> {
  const started = Date.now();
  const res = await fetch(`${apiBase}/ai/voice/tts/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/octet-stream, audio/mpeg'
    },
    body: JSON.stringify({ text }),
    signal
  });
  logAveVoice('tts-http', {
    provider: 'elevenlabs',
    status: res.status,
    latency: Date.now() - started,
    ok: res.ok
  });
  return res;
}

export function pcmSampleRateFromFormat(format: string): number {
  const m = /^pcm_(\d+)$/i.exec((format || '').trim());
  return m ? Number(m[1]) : 0;
}

export function int16LeToFloat32(bytes: Uint8Array): Float32Array {
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, even / 2);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] / 32768;
  }
  return out;
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.byteLength) {
    return b;
  }
  if (!b.byteLength) {
    return a;
  }
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!input.length || fromRate === toRate || fromRate <= 0 || toRate <= 0) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.min(input.length - 1, Math.floor(src));
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export async function playStreamedResponse(
  res: Response,
  signal: AbortSignal,
  opts: { format: string; sampleRate: number; ctx?: PcmAudioContext | null; audio?: HTMLAudioElement | null }
): Promise<void> {
  const rate = opts.sampleRate || pcmSampleRateFromFormat(opts.format);
  if (rate > 0 && res.body && opts.ctx) {
    await playPcmStream(res.body, signal, rate, opts.ctx);
    return;
  }
  if (opts.audio) {
    await playMpegResponse(res, signal, opts.audio);
    return;
  }
  throw new Error('tts-error');
}

/** Reproduce PCM 16-bit LE mono a medida que llegan bytes. Prefetch corto para evitar cortes. */
export async function playPcmStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  sampleRate: number,
  ctx: PcmAudioContext
): Promise<void> {
  const reader = body.getReader();
  const sources: Array<{ stop(): void }> = [];
  let nextTime = 0;
  let leftover = new Uint8Array(0);
  let started = false;
  const prebufferSec = 0.14;
  let pending: Float32Array[] = [];
  let pendingSamples = 0;

  const schedule = (samples: Float32Array) => {
    const pcm = resampleLinear(samples, sampleRate, ctx.sampleRate);
    if (!pcm.length) {
      return;
    }
    const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buffer.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextTime < now + 0.02) {
      nextTime = now + 0.02;
    }
    src.start(nextTime);
    nextTime += buffer.duration;
    sources.push(src);
    started = true;
  };

  const flush = (force: boolean) => {
    if (!pendingSamples) {
      return;
    }
    if (!force && !started && pendingSamples / sampleRate < prebufferSec) {
      return;
    }
    const merged = new Float32Array(pendingSamples);
    let offset = 0;
    for (const chunk of pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pending = [];
    pendingSamples = 0;
    schedule(merged);
  };

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
    for (const src of sources) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    }
  };

  if (signal.aborted) {
    onAbort();
    return;
  }
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.byteLength) {
        continue;
      }
      const bytes = concatBytes(leftover, value);
      const even = bytes.byteLength - (bytes.byteLength % 2);
      leftover = even < bytes.byteLength ? new Uint8Array(bytes.slice(even)) : new Uint8Array(0);
      if (even === 0) {
        continue;
      }
      const pcm = int16LeToFloat32(new Uint8Array(bytes.slice(0, even)));
      pending.push(pcm);
      pendingSamples += pcm.length;
      flush(false);
    }
    if (!signal.aborted) {
      if (leftover.byteLength >= 2) {
        const pcm = int16LeToFloat32(leftover);
        pending.push(pcm);
        pendingSamples += pcm.length;
        leftover = new Uint8Array(0);
      }
      flush(true);
      const remainingMs = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      await waitMs(remainingMs, signal);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export function playMpegResponse(res: Response, signal: AbortSignal, audio: HTMLAudioElement): Promise<void> {
  return (async () => {
    const buf = await res.arrayBuffer();
    if (signal.aborted) {
      return;
    }
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve, reject) => {
      const onEnded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('tts-error'));
      };
      const onAbort = () => {
        cleanup();
        audio.pause();
        resolve();
      };
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
        URL.revokeObjectURL(url);
      };
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });
      audio.src = url;
      const play = audio.play();
      if (play && typeof play.catch === 'function') {
        play.catch(() => {
          cleanup();
          reject(new Error('tts-blocked'));
        });
      }
    });
  })();
}

function browserStatus(): PremiumVoiceStatus {
  return { enabled: false, provider: 'browser', model: 'speechSynthesis', format: 'speechSynthesis', sampleRate: 0 };
}

function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    const onAbort = () => finish();
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
