import { describe, expect, it } from 'vitest';
import {
  isDuplicateOutboundText,
  isLikelyVoiceEcho,
  planTtsForCopilotReply,
  shouldIgnoreComposerKeydown,
  shouldStopVoiceOnOutboundMessage
} from './ave-voice-turn';

describe('ave-voice-turn', () => {
  it('una respuesta genera un solo texto TTS', () => {
    const plan = planTtsForCopilotReply('Hola Carlos. ¿Seguimos con el reporte?');
    expect(plan).toEqual(['Hola Carlos. ¿Seguimos con el reporte?']);
    expect(plan).toHaveLength(1);
  });

  it('no parte la respuesta en dos generaciones', () => {
    const plan = planTtsForCopilotReply('Primera. Segunda. Tercera.');
    expect(plan.join(' ')).not.toBe('Primera.');
    expect(plan).toHaveLength(1);
  });

  it('send() debe cortar la voz anterior', () => {
    expect(shouldStopVoiceOnOutboundMessage()).toBe(true);
  });

  it('respuesta vacía no pide TTS', () => {
    expect(planTtsForCopilotReply('   ')).toEqual([]);
  });

  it('ignora Enter repetido o en composición IME', () => {
    expect(shouldIgnoreComposerKeydown({ repeat: true })).toBe(true);
    expect(shouldIgnoreComposerKeydown({ isComposing: true })).toBe(true);
    expect(shouldIgnoreComposerKeydown({ repeat: false, isComposing: false })).toBe(false);
  });

  it('bloquea el mismo texto si se reenvía enseguida', () => {
    expect(isDuplicateOutboundText('Hola Ave', 'hola ave', 3000, 1000)).toBe(true);
    expect(isDuplicateOutboundText('Hola Ave', 'hola ave', 5000, 1000)).toBe(false);
    expect(isDuplicateOutboundText('Otra cosa', 'hola ave', 1500, 1000)).toBe(false);
  });

  it('detecta eco del usuario o de Ave', () => {
    expect(isLikelyVoiceEcho('Hola Ave', 'hola ave', 'Claro, te ayudo', 2000, 0)).toBe(true);
    expect(isLikelyVoiceEcho('Claro, te ayudo', 'precio del tour', 'Claro, te ayudo.', 2000, 0)).toBe(
      true
    );
    expect(isLikelyVoiceEcho('Quiero otra cosa', 'hola', 'respuesta distinta', 2000, 0)).toBe(false);
  });
});
