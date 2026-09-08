import { describe, expect, it } from 'vitest';
import {
  classifyTool,
  confirmationPrompt,
  isBareAffirmation,
  isConfirmingThisAction,
  looksLikeCrmAction,
  requiresExplicitConfirm,
  sanitizeUserError
} from './ave-action-safety';

describe('ave-action-safety', () => {
  it('clasifica tools', () => {
    expect(classifyTool('QUOTE_NATURAL_LANGUAGE')).toBe('READ_ONLY');
    expect(classifyTool('SEARCH_CLIENTS')).toBe('READ_ONLY');
    expect(classifyTool('CREATE_RESERVATION')).toBe('MUTATING');
    expect(classifyTool('UPDATE_CLIENT')).toBe('MUTATING');
    expect(classifyTool('SEND_CONVERSATION_MESSAGE')).toBe('EXTERNAL_ACTION');
    expect(requiresExplicitConfirm('READ_ONLY')).toBe(false);
    expect(requiresExplicitConfirm('EXTERNAL_ACTION')).toBe(true);
  });

  it('sí confirma solo si ya hay una acción pendiente concreta', () => {
    const pending = {
      confirmationId: 'abc-token',
      tool: 'SEND_CONVERSATION_MESSAGE',
      summary: 'Esto enviará el mensaje a Carlos.',
      safety: 'EXTERNAL_ACTION' as const
    };
    expect(isBareAffirmation('Sí')).toBe(true);
    expect(isConfirmingThisAction(null, 'Sí')).toBe(false);
    expect(isConfirmingThisAction(pending, 'Sí')).toBe(true);
    expect(isConfirmingThisAction(pending, 'abc-token')).toBe(true);
    expect(confirmationPrompt(pending)).toMatch(/continuar/i);
    expect(confirmationPrompt(pending)).not.toMatch(/^¿Seguro\?$/);
  });

  it('detecta instrucciones CRM y deja preguntas al copilot', () => {
    expect(looksLikeCrmAction('Busca a Carlos')).toBe(true);
    expect(looksLikeCrmAction('Muéstrame sus reservas')).toBe(true);
    expect(looksLikeCrmAction('Actualiza su teléfono')).toBe(true);
    expect(looksLikeCrmAction('Cancela la segunda')).toBe(true);
    expect(looksLikeCrmAction('Crea una reserva para este cliente')).toBe(true);
    expect(looksLikeCrmAction('¿Cómo crear una reserva?')).toBe(false);
    expect(looksLikeCrmAction('Cotiza 4 personas Acaime')).toBe(false);
    expect(looksLikeCrmAction('¿Quién es este cliente?')).toBe(false);
  });

  it('oculta errores técnicos al usuario', () => {
    expect(sanitizeUserError('java.sql.SQLException: relation foo')).toMatch(/No pude completar/i);
    expect(sanitizeUserError('sk-ant-secret')).toMatch(/No pude completar/i);
    expect(sanitizeUserError('Fila no encontrada')).toBe('Fila no encontrada');
  });
});
