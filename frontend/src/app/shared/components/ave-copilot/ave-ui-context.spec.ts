import { describe, expect, it } from 'vitest';
import { compactAveUiContext } from './ave-ui-context';

describe('compactAveUiContext', () => {
  it('solo incluye claves permitidas', () => {
    const json = compactAveUiContext({
      module: 'Registro',
      role: 'GERENCIA',
      entity: {
        type: 'SEGUIMIENTO',
        allowed: {
          cliente: 'Juan Pérez',
          celular: '3001234567',
          notas: 'secreto interno',
          hoja: 'ENE'
        }
      }
    });
    const parsed = JSON.parse(json) as {
      module: string;
      allowedContext: Record<string, string>;
    };
    expect(parsed.module).toBe('Registro');
    expect(parsed.allowedContext['cliente']).toBe('Juan Pérez');
    expect(parsed.allowedContext['notas']).toBeUndefined();
    expect(json).not.toContain('secreto');
  });

  it('incluye DISC cuando el registro lo enfoca', () => {
    const json = compactAveUiContext({
      module: 'Registro',
      entity: {
        type: 'SEGUIMIENTO',
        allowed: { disc: 'C', cliente: 'Ana' }
      }
    });
    const parsed = JSON.parse(json) as { allowedContext: Record<string, string> };
    expect(parsed.allowedContext['disc']).toBe('C');
  });
});
