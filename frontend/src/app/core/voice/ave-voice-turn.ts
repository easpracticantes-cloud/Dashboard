import { stripForSpeech } from './voice-output.service';

/** Una respuesta de Ave = un solo texto TTS. Nunca primera frase + resto. */
export function planTtsForCopilotReply(fullReply: string): string[] {
  const text = stripForSpeech(fullReply);
  return text ? [text] : [];
}

export function shouldStopVoiceOnOutboundMessage(): boolean {
  return true;
}
