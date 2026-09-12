import { describe, expect, it } from 'vitest';
import { moduleLabelFromUrl } from './ave-app-context';

describe('moduleLabelFromUrl', () => {
  it('mapea rutas conocidas a etiquetas de módulo', () => {
    expect(moduleLabelFromUrl('/app/registro')).toBe('Registro');
    expect(moduleLabelFromUrl('/app/contabilidad?x=1')).toBe('Contabilidad');
    expect(moduleLabelFromUrl('/app/dashboard')).toBe('Dashboard');
  });

  it('usa etiqueta genérica fuera de módulos conocidos', () => {
    expect(moduleLabelFromUrl('/login')).toBe('SIG-EAS');
  });
});
