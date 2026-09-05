import { describe, expect, it } from 'vitest';
import { classifyTool, isConfirmingThisAction, requiresExplicitConfirm } from './ave-action-safety';
import { friendlyVoiceError } from './speech-types';
import { stripForSpeech } from './voice-output.service';

describe('Voice helpers', () => {
  it('stripForSpeech quita markdown', () => {
    expect(stripForSpeech('**Hola** `mundo` [link](https://x.com)')).toBe('Hola mundo link');
  });

  it('friendlyVoiceError cubre permiso y soporte', () => {
    expect(friendlyVoiceError('not-allowed')).toMatch(/bloqueado/i);
    expect(friendlyVoiceError('unsupported')).toMatch(/API de dictado/i);
    expect(friendlyVoiceError('tts-blocked')).toMatch(/audio/i);
  });

  it('clasifica tools y no acepta un sí suelto sin pending', () => {
    expect(classifyTool('QUOTE_NATURAL_LANGUAGE')).toBe('READ_ONLY');
    expect(classifyTool('CREATE_RESERVATION')).toBe('MUTATING');
    expect(classifyTool('SEND_CONVERSATION_MESSAGE')).toBe('EXTERNAL_ACTION');
    expect(requiresExplicitConfirm('READ_ONLY')).toBe(false);
    expect(requiresExplicitConfirm('EXTERNAL_ACTION')).toBe(true);
    expect(isConfirmingThisAction(null, 'Sí')).toBe(false);
    expect(
      isConfirmingThisAction(
        {
          confirmationId: 'abc',
          tool: 'SEND_CONVERSATION_MESSAGE',
          summary: 'Enviar',
          safety: 'EXTERNAL_ACTION',
        },
        'Sí'
      )
    ).toBe(true);
  });
});
