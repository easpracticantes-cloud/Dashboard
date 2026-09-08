import { describe, expect, it } from 'vitest';
import { AVE_COPY, stripWakePrefix } from './ave-wake';

describe('ave-wake', () => {
  it('recorta Ave y detecta solo el wake word', () => {
    expect(stripWakePrefix('Ave')).toEqual({ hadWake: true, wakeOnly: true, message: '' });
    expect(stripWakePrefix('Ave, muéstrame las reservas de hoy.')).toEqual({
      hadWake: true,
      wakeOnly: false,
      message: 'muéstrame las reservas de hoy.'
    });
    expect(stripWakePrefix('Oye Ave, busca a Carlos')).toEqual({
      hadWake: true,
      wakeOnly: false,
      message: 'busca a Carlos'
    });
    expect(stripWakePrefix('ave cotiza 4 pax')).toEqual({
      hadWake: true,
      wakeOnly: false,
      message: 'cotiza 4 pax'
    });
    expect(stripWakePrefix('Busca a Carlos')).toEqual({
      hadWake: false,
      wakeOnly: false,
      message: 'Busca a Carlos'
    });
  });

  it('mantiene copys cortos de personalidad', () => {
    expect(AVE_COPY.listening).toBe('Te escucho.');
    expect(AVE_COPY.cancelled).toBe('Cancelado. No toqué nada.');
    expect(AVE_COPY.failed).toBe('No pude completar esa operación.');
    expect(AVE_COPY.welcome.length).toBeLessThan(80);
  });
});
