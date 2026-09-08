import { describe, expect, it } from 'vitest';
import { planTtsForCopilotReply, shouldStopVoiceOnOutboundMessage } from './ave-voice-turn';

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
});
