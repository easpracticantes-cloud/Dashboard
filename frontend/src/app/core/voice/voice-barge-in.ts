import { logAveVoice } from './speech-types';

const GRACE_MS = 450;
const HOLD_MS = 180;
const RMS_THRESHOLD = 0.048;

export interface BargeInSession {
  stopDetection(): void;
  release(): void;
}

export function shouldArmSpeakingBargeIn(opts: {
  speaking: boolean;
  alreadyListening: boolean;
  micGranted: boolean;
}): boolean {
  return opts.speaking && !opts.alreadyListening && opts.micGranted;
}

export function voiceActivityDetected(rms: number, threshold = RMS_THRESHOLD): boolean {
  return rms >= threshold;
}

export function sustainedSpeech(heldMs: number, needMs = HOLD_MS): boolean {
  return heldMs >= needMs;
}

export function rmsFromSamples(samples: ArrayLike<number>): number {
  if (!samples.length) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    sum += x * x;
  }
  return Math.sqrt(sum / samples.length);
}

export async function microphoneAlreadyGranted(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      permissions?: { query: (q: { name: string }) => Promise<{ state: string }> };
    };
    const status = await nav.permissions?.query({ name: 'microphone' });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * VAD solo mientras Ave habla. No toca SpeechRecognition ni corta tracks
 * justo antes de start() — el caller libera el mic después de que el STT arranque.
 */
export function startSpeakingBargeIn(onSpeech: () => void): BargeInSession {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  let timer = 0;
  let stopped = false;
  let fired = false;
  const startedAt = Date.now();
  let loudSince = 0;

  const stopDetection = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
    if (ctx) {
      void ctx.close().catch(() => undefined);
      ctx = null;
    }
  };

  const release = () => {
    stopped = true;
    stopDetection();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { stopDetection, release };
  }

  void navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    .then((mic) => {
      if (stopped) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = mic;
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(mic);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);

      const tick = () => {
        if (stopped || fired || !ctx) {
          return;
        }
        analyser.getFloatTimeDomainData(data);
        const rms = rmsFromSamples(data);
        const ready = Date.now() - startedAt >= GRACE_MS;
        if (ready && voiceActivityDetected(rms)) {
          if (!loudSince) {
            loudSince = Date.now();
          }
          if (sustainedSpeech(Date.now() - loudSince)) {
            fired = true;
            logAveVoice('barge-in', { reason: 'vad', state: 'speaking' });
            onSpeech();
            return;
          }
        } else {
          loudSince = 0;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })
    .catch(() => {
      logAveVoice('barge-in', { reason: 'vad-unavailable' });
    });

  return { stopDetection, release };
}
