export interface AveFocusItem {
  index: number;
  label: string;
}

const SESSION_KEY = 'eas-ave-session-id';

/** Referencias cortas que deben ir al copilot CON el sessionId existente. No se interceptan. */
export function isFollowUpUtterance(text: string): boolean {
  const t = (text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!t || t.length > 80) return false;
  return /^(ese|esa|eso|abrelo|muestramela|muestramelo|el segundo|la segunda|el primero|la primera|el tercero|la tercera|cual(?: es)?|y (?:eso|esa|ese)|continua|sigue)(?:[?.!\s].*)?$/.test(
    t
  );
}

/** Extrae ítems numerados o con viñeta del último mensaje de Ave (solo UI). */
export function parseFocusItems(reply: string, max = 5): AveFocusItem[] {
  const raw = (reply || '').replace(/\r/g, '');
  const items: AveFocusItem[] = [];
  const numbered = /^\s*(?:\d+)[\.\)]\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = numbered.exec(raw)) && items.length < max) {
    const label = stripMd(m[1]);
    if (label) items.push({ index: items.length + 1, label });
  }
  if (items.length) return items;

  const bullets = /^\s*[-*]\s+(.+)$/gm;
  while ((m = bullets.exec(raw)) && items.length < max) {
    const label = stripMd(m[1]);
    if (label) items.push({ index: items.length + 1, label });
  }
  return items;
}

export function readStoredSessionId(): string | null {
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function storeSessionId(sessionId: string | null): void {
  try {
    if (!sessionId) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

function stripMd(s: string): string {
  return (s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}
