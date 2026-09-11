import { stripForSpeech } from './voice-output.service';

/** Una respuesta de Ave = un solo texto TTS. Nunca primera frase + resto. */
export function planTtsForCopilotReply(fullReply: string): string[] {
  const text = stripForSpeech(fullReply);
  return text ? [text] : [];
}

export function shouldStopVoiceOnOutboundMessage(): boolean {
  return true;
}

export function normalizeUtterance(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:…"'«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Enter repetido (tecla sostenida) o IME no deben disparar un segundo envío. */
export function shouldIgnoreComposerKeydown(event: {
  repeat?: boolean;
  isComposing?: boolean;
}): boolean {
  return !!event.repeat || !!event.isComposing;
}

/** Mismo texto reenviado enseguida: Enter residual o eco de voz, no un turno nuevo. */
export function isDuplicateOutboundText(
  text: string,
  lastText: string,
  nowMs: number,
  lastSentAtMs: number,
  windowMs = 2500
): boolean {
  const a = normalizeUtterance(text);
  const b = normalizeUtterance(lastText);
  return !!a && a === b && nowMs - lastSentAtMs < windowMs;
}

/** STT que repite lo que acaba de decir el usuario o Ave (altavoz / eco). */
export function isLikelyVoiceEcho(
  heard: string,
  lastUserText: string,
  lastAssistantText: string,
  nowMs: number,
  lastSentAtMs: number
): boolean {
  const n = normalizeUtterance(heard);
  if (!n) {
    return false;
  }
  const age = nowMs - lastSentAtMs;
  if (age < 0 || age > 12_000) {
    return false;
  }
  const user = normalizeUtterance(lastUserText);
  if (user && age < 8000 && (n === user || similarUtterance(n, user))) {
    return true;
  }
  const ave = normalizeUtterance(lastAssistantText);
  return !!ave && similarUtterance(n, ave);
}

function similarUtterance(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 8 && long.includes(short);
}
