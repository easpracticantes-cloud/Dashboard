/**
 * Wake word "Ave" en el navegador: no hay API nativa fiable.
 * Esto solo recorta el prefijo y detecta "Ave" solo.
 */
export function stripWakePrefix(raw: string): {
  hadWake: boolean;
  wakeOnly: boolean;
  message: string;
} {
  const t = (raw || '').trim();
  if (!t) {
    return { hadWake: false, wakeOnly: false, message: '' };
  }
  const m = t.match(/^(?:oye\s+)?ave\b\s*[,.:]?\s*/i);
  if (!m) {
    return { hadWake: false, wakeOnly: false, message: t };
  }
  const rest = t.slice(m[0].length).trim();
  return { hadWake: true, wakeOnly: !rest, message: rest };
}

export const AVE_COPY = {
  listening: 'Te escucho.',
  cancelled: 'Cancelado. No toqué nada.',
  failed: 'No pude completar esa operación.',
  welcome: 'Hola. Soy Ave. Dime qué necesitas.'
} as const;
