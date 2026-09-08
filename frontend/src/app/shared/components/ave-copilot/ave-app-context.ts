/** Etiqueta de módulo para la UI de Ave. No se envía al modelo. */
export function moduleLabelFromUrl(url: string): string {
  const path = (url || '').split('?')[0].toLowerCase();
  if (path.includes('/registro')) return 'Registro';
  if (path.includes('/contabilidad')) return 'Contabilidad';
  if (path.includes('/dashboard')) return 'Dashboard';
  if (path.includes('/analytics')) return 'Analítica';
  if (path.includes('/ai')) return 'Consola IA';
  if (path.includes('/users')) return 'Usuarios';
  if (path.includes('/settings')) return 'Ajustes';
  if (path.includes('/profile')) return 'Perfil';
  if (path.includes('/reports')) return 'Reportes';
  if (path.includes('/notifications')) return 'Avisos';
  if (path.includes('/help')) return 'Ayuda';
  if (path.includes('/history')) return 'Historial';
  return 'SIG-EAS';
}
