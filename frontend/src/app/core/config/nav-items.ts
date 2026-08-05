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

const WITHOUT_CONTABILIDAD: RoleCode[] = ALL_ROLES.filter((role) => role !== 'CONTABILIDAD');

/** Sidebar alineado al workbook Google Sheets. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard Sheets', icon: 'space_dashboard', route: '/app/dashboard', roles: ALL_ROLES },
  { label: 'Seguimiento', icon: 'forum', route: '/app/conversations', roles: WITHOUT_CONTABILIDAD },
  { label: 'Clientes', icon: 'diversity_3', route: '/app/clients', roles: ALL_ROLES },
  { label: 'Cotizaciones', icon: 'request_quote', route: '/app/quotes', roles: ALL_ROLES },
  { label: 'Reservas', icon: 'event_available', route: '/app/reservations', roles: ALL_ROLES },
  { label: 'Ventas', icon: 'payments', route: '/app/sales', roles: ALL_ROLES },
  { label: 'Analítica', icon: 'monitoring', route: '/app/analytics', roles: ALL_ROLES },
  { label: 'IA Enterprise', icon: 'auto_awesome', route: '/app/ai', roles: ALL_ROLES },
  { label: 'Reportes', icon: 'summarize', route: '/app/reports', roles: ALL_ROLES },
  { label: 'Usuarios', icon: 'group', route: '/app/users', roles: ['ADMINISTRADOR', 'GERENCIA', 'SUPERVISOR'] },
  { label: 'Configuración', icon: 'settings', route: '/app/settings', roles: ALL_ROLES },
  { label: 'Ayuda', icon: 'help_outline', route: '/app/help', roles: ALL_ROLES }
];
