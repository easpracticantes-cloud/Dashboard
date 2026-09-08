import { describe, expect, it } from 'vitest';
import { friendlyVoiceError } from './speech-types';
import { stripForSpeech, firstSentence, remainderAfterFirstSentence } from './voice-output.service';

describe('Voice helpers', () => {
  it('stripForSpeech quita markdown', () => {
    expect(stripForSpeech('**Hola** `mundo` [link](https://x.com)')).toBe('Hola mundo link');
  });

  it('friendlyVoiceError cubre permiso y soporte', () => {
    expect(friendlyVoiceError('not-allowed')).toMatch(/bloqueado/i);
    expect(friendlyVoiceError('unsupported')).toMatch(/API de dictado/i);
    expect(friendlyVoiceError('tts-blocked')).toMatch(/audio/i);
  });

  it('parte la primera frase para hablar antes', () => {
    expect(firstSentence('Hola Carlos. ¿Seguimos?')).toBe('Hola Carlos.');
    expect(remainderAfterFirstSentence('Hola Carlos. ¿Seguimos?')).toBe('¿Seguimos?');
  });
});
