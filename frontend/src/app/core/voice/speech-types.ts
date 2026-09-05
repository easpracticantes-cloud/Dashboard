export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';
export type VoiceOutputState = 'idle' | 'speaking' | 'paused' | 'error';
export type AveVoiceUiState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

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
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function friendlyVoiceError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'El micrófono está bloqueado. Permite el acceso en el navegador e inténtalo de nuevo.';
    case 'denied':
      return 'No diste permiso para usar el micrófono.';
    case 'no-speech':
      return 'No escuché nada. Pulsa el micrófono e inténtalo otra vez.';
    case 'audio-capture':
      return 'No hay micrófono disponible.';
    case 'network':
      return 'Falló la transcripción (red). Revisa la conexión e inténtalo de nuevo.';
    case 'aborted':
      return 'Detuviste la grabación.';
    case 'unsupported':
      return 'Este navegador no soporta dictado por voz. Usa Chrome o Edge en escritorio.';
    case 'tts-blocked':
      return 'El navegador bloqueó el audio. Pulsa de nuevo para oír a Ave.';
    case 'tts-error':
      return 'No pude leer la respuesta en voz alta.';
    default:
      return 'Hubo un problema con la voz. Puedes escribir o reintentar.';
  }
}
