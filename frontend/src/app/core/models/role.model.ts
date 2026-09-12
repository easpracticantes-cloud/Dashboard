export type RoleCode =
  | 'ADMINISTRADOR'
  | 'GERENCIA'
  | 'COMERCIAL'
  | 'CONTABILIDAD'
  | 'OPERACIONES'
  | 'SUPERVISOR'
  | 'ASESOR';

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMINISTRADOR: 'Administrador',
  GERENCIA: 'Gerencia',
  COMERCIAL: 'Comercial',
  CONTABILIDAD: 'Contabilidad',
  OPERACIONES: 'Operaciones',
  SUPERVISOR: 'Supervisor',
  ASESOR: 'Asesor'
};

export const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  ADMINISTRADOR: 'Control total: usuarios, configuración y todos los módulos.',
  GERENCIA: 'Ve el negocio completo y puede gestionar el equipo.',
  SUPERVISOR: 'Opera el día a día y consulta el equipo, sin borrar cuentas.',
  COMERCIAL: 'Registro, analítica y reportes para el pipeline.',
  CONTABILIDAD: 'Autobits, facturas, Excel de alineación y reportes.',
  OPERACIONES: 'Registro, dashboard y seguimiento operativo.',
  ASESOR: 'Registro y seguimiento de prospectos en Sheets.'
};

export const ROLE_ACCESS: Record<RoleCode, string[]> = {
  ADMINISTRADOR: [
    'Dashboard',
    'Registro',
    'Contabilidad',
    'Analítica',
    'Reportes',
    'Usuarios',
    'Configuración',
    'Ayuda'
  ],
  GERENCIA: [
    'Dashboard',
    'Registro',
    'Contabilidad',
    'Analítica',
    'Reportes',
    'Usuarios',
    'Configuración',
    'Ayuda'
  ],
  SUPERVISOR: [
    'Dashboard',
    'Registro',
    'Contabilidad',
    'Analítica',
    'Reportes',
    'Usuarios',
    'Configuración',
    'Ayuda'
  ],
  CONTABILIDAD: ['Dashboard', 'Registro', 'Contabilidad', 'Analítica', 'Reportes', 'Configuración', 'Ayuda'],
  COMERCIAL: ['Dashboard', 'Registro', 'Analítica', 'Reportes', 'Configuración', 'Ayuda'],
  OPERACIONES: ['Dashboard', 'Registro', 'Analítica', 'Reportes', 'Configuración', 'Ayuda'],
  ASESOR: ['Dashboard', 'Registro', 'Analítica', 'Reportes', 'Configuración', 'Ayuda']
};
