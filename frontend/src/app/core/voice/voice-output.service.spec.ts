import { describe, expect, it } from 'vitest';
import { friendlyVoiceError } from './speech-types';
import {
  firstSentence,
  isIgnorableTtsError,
  remainderAfterFirstSentence,
  stripForSpeech
} from './voice-output.service';

describe('Voice helpers', () => {
  it('stripForSpeech quita markdown', () => {
    expect(stripForSpeech('**Hola** `mundo` [link](https://x.com)')).toBe('Hola mundo link');
  });

  it('friendlyVoiceError cubre permiso y soporte', () => {
    expect(friendlyVoiceError('not-allowed')).toMatch(/bloqueado/i);
    expect(friendlyVoiceError('unsupported')).toMatch(/API de dictado/i);
    expect(friendlyVoiceError('tts-blocked')).toMatch(/audio/i);
  });

  it('barge-in: canceled/interrupted no marcan error de TTS', () => {
    expect(isIgnorableTtsError('canceled')).toBe(true);
    expect(isIgnorableTtsError('interrupted')).toBe(true);
    expect(isIgnorableTtsError('not-allowed')).toBe(false);
    expect(friendlyVoiceError('tts-error')).toMatch(/voz alta/i);
  });

  it('helpers de frase no se usan para partir el TTS premium', () => {
    expect(firstSentence('Hola Carlos. ¿Seguimos?')).toBe('Hola Carlos.');
    expect(remainderAfterFirstSentence('Hola Carlos. ¿Seguimos?')).toBe('¿Seguimos?');
  });

  it('fallback de voz premium no rompe el contrato de helpers', () => {
    expect(stripForSpeech('**Te escucho.**')).toBe('Te escucho.');
  });
});
