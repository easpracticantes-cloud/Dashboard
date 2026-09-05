import { RoleCode } from '../models/role.model';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: RoleCode[];
  badge?: string;
}

const ALL_ROLES: RoleCode[] = [
  'ADMINISTRADOR',
  'GERENCIA',
  'COMERCIAL',
  'CONTABILIDAD',
  'OPERACIONES',
  'SUPERVISOR',
  'ASESOR'
];

/** Sidebar alineado al workbook Google Sheets. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard Sheets', icon: 'space_dashboard', route: '/app/dashboard', roles: ALL_ROLES },
  { label: 'Registro', icon: 'table_chart', route: '/app/registro', roles: ALL_ROLES },
  {
    label: 'Contabilidad',
    icon: 'account_balance',
    route: '/app/contabilidad',
    roles: ['ADMINISTRADOR', 'GERENCIA', 'CONTABILIDAD', 'SUPERVISOR']
  },
  { label: 'Analítica', icon: 'monitoring', route: '/app/analytics', roles: ALL_ROLES },
  { label: 'Consola IA', icon: 'tune', route: '/app/ai', roles: ['ADMINISTRADOR', 'GERENCIA', 'SUPERVISOR'] },
  { label: 'Reportes', icon: 'summarize', route: '/app/reports', roles: ALL_ROLES },
  { label: 'Usuarios', icon: 'group', route: '/app/users', roles: ['ADMINISTRADOR', 'GERENCIA', 'SUPERVISOR'] },
  { label: 'Configuración', icon: 'settings', route: '/app/settings', roles: ALL_ROLES },
  { label: 'Ayuda', icon: 'help_outline', route: '/app/help', roles: ALL_ROLES }
];
