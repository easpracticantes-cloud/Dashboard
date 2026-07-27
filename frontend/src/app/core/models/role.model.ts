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
