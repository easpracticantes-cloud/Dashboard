import { describe, expect, it } from 'vitest';
import { isFollowUpUtterance, parseFocusItems } from './ave-thread-focus';

describe('ave-thread-focus', () => {
  it('detecta referencias cortas sin interceptar el cerebro', () => {
    expect(isFollowUpUtterance('el segundo')).toBe(true);
    expect(isFollowUpUtterance('ese')).toBe(true);
    expect(isFollowUpUtterance('Ábrelo')).toBe(true);
    expect(isFollowUpUtterance('Muéstrame las reservas de mañana')).toBe(false);
  });

  it('parsea listas numeradas de la última respuesta', () => {
    const items = parseFocusItems(
      'Tienes tres.\n1. **Carlos Pérez** a las 11:30\n2. Ana Gómez\n3. EAS-2048'
    );
    expect(items.map((i) => i.label)).toEqual(['Carlos Pérez a las 11:30', 'Ana Gómez', 'EAS-2048']);
  });
});
