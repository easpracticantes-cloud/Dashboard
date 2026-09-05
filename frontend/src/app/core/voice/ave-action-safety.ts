/**
 * Contrato de la siguiente fase: Ave no ejecuta tools desde voz todavía.
 * Las acciones reales viven en POST /ai/actions/execute (dryRun + confirm).
 * La confirmación debe ir atada a un token de la acción, no a un "sí" suelto.
 */
export type ActionSafetyClass = 'READ_ONLY' | 'MUTATING' | 'EXTERNAL_ACTION';

export interface PendingActionConfirm {
  confirmationId: string;
  tool: string;
  summary: string;
  safety: ActionSafetyClass;
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
    name.includes('FIND_OR_CREATE')
  ) {
    return 'MUTATING';
  }
  return 'READ_ONLY';
}

export function requiresExplicitConfirm(safety: ActionSafetyClass): boolean {
  return safety === 'MUTATING' || safety === 'EXTERNAL_ACTION';
}

export function isConfirmingThisAction(
  pending: PendingActionConfirm | null,
  spoken: string
): boolean {
  if (!pending || !requiresExplicitConfirm(pending.safety)) {
    return false;
  }
  const t = (spoken || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return /^(si|confirmo|dale|ok|okay|de acuerdo|afirmativo)(\b|$)/.test(t);
}
