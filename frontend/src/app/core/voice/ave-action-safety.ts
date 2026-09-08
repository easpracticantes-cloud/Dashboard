/**
 * Ave reutiliza POST /ai/actions/execute.
 * Lectura: se ejecuta. Mutación/externa: confirmación atada a ESA acción.
 * Un «sí» solo confirma si ya hay un pending concreto (no inventa la acción).
 */
export type ActionSafetyClass = 'READ_ONLY' | 'MUTATING' | 'EXTERNAL_ACTION';

export interface PendingActionConfirm {
  confirmationId: string;
  tool: string;
  summary: string;
  safety: ActionSafetyClass;
}

export interface AveFocusHit {
  id: string;
  label: string;
}

function fold(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^[¿¡\s"'«»]+/u, '');
}

export function classifyTool(tool: string): ActionSafetyClass {
  const name = (tool || '').toUpperCase();
  if (
    name.includes('SEND') ||
    name.includes('WHATSAPP') ||
    name.includes('EMAIL') ||
    name.includes('DRIVE') ||
    name.includes('PUBLISH')
  ) {
    return 'EXTERNAL_ACTION';
  }
  if (
    name.startsWith('CREATE') ||
    name.startsWith('CANCEL') ||
    name.startsWith('SET_') ||
    name.startsWith('ASSIGN') ||
    name.startsWith('GENERATE') ||
    name.startsWith('UPDATE') ||
    name.includes('FIND_OR_CREATE')
  ) {
    return 'MUTATING';
  }
  return 'READ_ONLY';
}

export function requiresExplicitConfirm(safety: ActionSafetyClass): boolean {
  return safety === 'MUTATING' || safety === 'EXTERNAL_ACTION';
}

export function isBareAffirmation(spoken: string): boolean {
  const t = fold(spoken);
  return /^(si|confirmo|dale|ok|okay|de acuerdo|afirmativo)(\b|$)/.test(t);
}

/** Token de esa acción, o «sí» solo cuando el pending ya está acotado. */
export function isConfirmingThisAction(
  pending: PendingActionConfirm | null,
  spoken: string
): boolean {
  if (!pending?.confirmationId || !requiresExplicitConfirm(pending.safety)) {
    return false;
  }
  const t = (spoken || '').trim();
  if (!t) return false;
  if (t === pending.confirmationId || fold(t) === fold(pending.confirmationId)) {
    return true;
  }
  return isBareAffirmation(t);
}

export function confirmationPrompt(pending: PendingActionConfirm): string {
  const summary = (pending.summary || '').trim();
  if (summary) {
    const base = /[?.!]$/.test(summary) ? summary : `${summary}.`;
    if (/quieres continuar|continuar\?/i.test(base)) {
      return base;
    }
    return `${base} ¿Quieres continuar?`;
  }
  return 'Esto modificará datos del CRM. ¿Quieres continuar?';
}

export function sanitizeUserError(raw: string): string {
  const t = (raw || '').trim();
  if (!t) return 'No pude completar esa operación.';
  if (/(sk-ant-|AIza|Bearer\s+\S{20,}|api[_-]?key\s*[:=])/i.test(t)) {
    return 'No pude completar esa operación.';
  }
  if (/(exception|stacktrace|sql|jdbc|hibernate|nullpointer|caused by:)/i.test(t)) {
    return 'No pude completar esa operación. Revisa los datos e inténtalo de nuevo.';
  }
  return t.length > 220 ? `${t.slice(0, 220)}…` : t;
}

/**
 * Instrucciones operativas claras. Preguntas y cotizaciones siguen en el copilot.
 */
export function looksLikeCrmAction(text: string): boolean {
  const t = fold(text);
  if (!t) return false;
  if (/^(que|quien|cual|como|cuanto|expli|dime |por que|podrias explic)/.test(t)) {
    return false;
  }
  if (/\b(tour|trekking|cotiz|precio)\b/.test(t) && !/\b(reserva|cliente)\b/.test(t)) {
    return false;
  }
  if (/\b(crea|crear|registra|registrar)\b.{0,48}\b(cliente|reserva)\b/.test(t)) return true;
  if (/\b(cancela|cancelar)\b/.test(t) && /\b(reserva|primera|segundo|segunda|tercera|esa|este)\b/.test(t)) {
    return true;
  }
  if (/\b(asigna|asignar)\b.{0,32}\b(conversaci|asesor)/.test(t)) return true;
  if (/\b(cambia|cambiar|actualiza|actualizar|pon|poner)\b.{0,40}\b(telefono|celular|correo|email|nombre)\b/.test(t)) {
    return true;
  }
  if (/\b(cambia|cambiar|pon|poner)\b.{0,32}\b(estado|prioridad)\b/.test(t)) return true;
  if (/\b(envia|enviar|manda|mandar)\b.{0,40}\b(mensaje|whatsapp|correo)\b/.test(t)) return true;
  if (/\b(genera|generar)\b.{0,40}\bcotiz/.test(t) && /\bconversaci/.test(t)) return true;
  if (/\bchecklist\b/.test(t) && /\b(dame|muestra|saca|genera)\b/.test(t)) return true;
  if (/\b(sugiere|sugerir|busca|buscar)\b.{0,32}\bproveedores?\b/.test(t)) return true;
  if (/\b(busca|buscar|encuentra|encontrar)\b/.test(t)) return true;
  if (/\b(muestra|mostrar|muestrame|lista|listar|consulta|consultar|revisa|revisar)\b.{0,48}\b(reserva|cliente|seguimiento)/.test(t)) {
    return true;
  }
  return false;
}
