export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';
export type VoiceOutputState = 'idle' | 'speaking' | 'paused' | 'error';
export type AveVoiceUiState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export const STT_PREFERRED_LANG = 'es-CO';
export const STT_LANG_FALLBACKS = ['es-CO', 'es-419', 'es-ES', 'es'] as const;
export const STT_LANG_STORAGE = 'eas-ave-stt-lang';
export const VOICE_DEBUG_STORAGE = 'eas-ave-voice-debug';

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? ctor : null;
}

export function speechRecognitionCtorName(): 'SpeechRecognition' | 'webkitSpeechRecognition' | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  if (typeof w.SpeechRecognition === 'function') return 'SpeechRecognition';
  if (typeof w.webkitSpeechRecognition === 'function') return 'webkitSpeechRecognition';
  return null;
}

export function detectBrowserLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }
  const uaData = (
    navigator as Navigator & {
      userAgentData?: { brands?: Array<{ brand: string }> };
    }
  ).userAgentData;
  const brands = uaData?.brands?.map((b) => b.brand).join(' ') || '';
  if (/brave/i.test(brands) || /brave/i.test(navigator.userAgent)) return 'Brave';
  if (/edg/i.test(navigator.userAgent)) return 'Edge';
  if (/chrome|crios/i.test(navigator.userAgent)) return 'Chrome';
  if (/firefox/i.test(navigator.userAgent)) return 'Firefox';
  if (/safari/i.test(navigator.userAgent)) return 'Safari';
  return brands || 'unknown';
}

export function sttLangCandidates(preferred = STT_PREFERRED_LANG): string[] {
  let remembered = '';
  try {
    remembered = localStorage.getItem(STT_LANG_STORAGE) || '';
  } catch {
    remembered = '';
  }
  return [...new Set([remembered, preferred, ...STT_LANG_FALLBACKS].filter(Boolean))];
}

export function rememberSttLang(lang: string): void {
  try {
    localStorage.setItem(STT_LANG_STORAGE, lang);
  } catch {
    /* ignore */
  }
}

/** Wake loop: no martillar el servicio de Google tras network/permiso. */
export function shouldRearmWakeAfterSttError(code: string): boolean {
  return !['network', 'service-not-allowed', 'not-allowed', 'denied', 'unsupported', 'audio-capture'].includes(
    code
  );
}

export function backoffMsAfterSttError(code: string, previous = 0): number {
  if (code !== 'network' && code !== 'service-not-allowed') {
    return 0;
  }
  return Math.min(8000, previous > 0 ? previous * 2 : 2000);
}

export function isVoiceDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    if (localStorage.getItem(VOICE_DEBUG_STORAGE) === '1') {
      return true;
    }
  } catch {
    /* ignore */
  }
  const host = window.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1';
}

/** Diagnóstico de voz: nunca tokens, JWT, transcripciones ni PII. */
export function logAveVoice(
  event: string,
  data: Record<string, string | number | boolean | null | undefined>
): void {
  if (!isVoiceDebugEnabled()) {
    return;
  }
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const k = key.toLowerCase();
    if (/token|jwt|secret|authoriz|transcript|utterance|message|pii|password/.test(k)) {
      continue;
    }
    safe[key] = value;
  }
  console.info('[Ave-voice]', event, safe);
}

export function friendlyVoiceError(code: string): string {
  const brave = detectBrowserLabel() === 'Brave';
  switch (code) {
    case 'not-allowed':
      return 'El micrófono está bloqueado. Permite el acceso en el candado del navegador e inténtalo de nuevo.';
    case 'service-not-allowed':
      return brave
        ? 'Brave bloqueó el servicio de dictado de Google (no es SIG-EAS). Activa los servicios de Google para voz o usa Chrome. Mientras tanto puedes escribir.'
        : 'El navegador bloqueó el servicio de dictado (no el backend de SIG-EAS). Prueba Chrome o revisa la política del equipo. Puedes escribir el mensaje.';
    case 'denied':
      return 'No diste permiso para usar el micrófono. Puedes escribirle a Ave.';
    case 'no-speech':
      return 'No escuché nada. Pulsa el micrófono e inténtalo otra vez, o escribe.';
    case 'audio-capture':
      return 'No hay micrófono disponible o el sistema no pudo capturar audio.';
    case 'network':
      return brave
        ? 'El dictado del navegador no alcanzó el reconocimiento de Google (Brave suele bloquearlo; no es el servidor de SIG-EAS). Usa Chrome o escribe el mensaje.'
        : 'El dictado del navegador no pudo usar su servicio de reconocimiento en la nube (Chrome habla con Google, no con el backend de SIG-EAS). Revisa bloqueadores o escribe el mensaje.';
    case 'aborted':
      return 'Detuviste la grabación.';
    case 'unsupported':
      return 'Este navegador no expone la API de dictado por voz. En Windows usa Chrome. Puedes escribirle a Ave.';
    case 'tts-blocked':
      return 'El navegador bloqueó el audio. Pulsa de nuevo para oír a Ave.';
    case 'tts-error':
      return 'No pude leer la respuesta en voz alta.';
    default:
      return 'Hubo un problema con la voz. Puedes escribir o reintentar.';
  }
}
