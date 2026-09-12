import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

interface HelpTopic {
  icon: string;
  title: string;
  body: string;
  route?: string;
  routeLabel?: string;
  steps?: string[];
}

@Component({
  selector: 'eas-help',
  standalone: true,
  imports: [RouterLink, MatIconModule, FormsModule, PageHeaderComponent],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss'
})
export class HelpComponent {
  readonly search = signal('');
  readonly openFaq = signal<number | null>(0);

  readonly topics: HelpTopic[] = [
    {
      icon: 'space_dashboard',
      title: 'Dashboard Sheets',
      body: 'Centro de mando: pulso del workbook, Claude y atajos a Registro y Contabilidad.',
      route: '/app/dashboard',
      routeLabel: 'Ir al dashboard',
      steps: ['Revisa indicadores del día.', 'Usa Ctrl/⌘ K para saltar a un módulo.', 'Abre Ave si necesitas contexto de la pantalla.']
    },
    {
      icon: 'table_chart',
      title: 'Registro',
      body: 'Alta y edición de filas del Excel: cliente, DISC por color, semáforo y canal. Puedes importar chats de WhatsApp (txt o zip) y confirmar antes de escribir.',
      route: '/app/registro',
      routeLabel: 'Ir a Registro',
      steps: [
        'Elige la hoja del workbook.',
        'Nueva fila o Editar; DISC se ve como Rojo, Amarillo, Verde o Azul.',
        'Registrada (Autobits / físico / WhatsApp) se diligencia a mano.',
        'Si subes chats, revisa el preview y confirma para guardar.'
      ]
    },
    {
      icon: 'account_balance',
      title: 'Contabilidad',
      body: 'Contabilidad AP: Autobits, facturas y pagos. Tras analizar un paquete de hasta 25 facturas se genera el Excel.',
      route: '/app/contabilidad',
      routeLabel: 'Abrir Contabilidad',
      steps: ['Carga Autobits.', 'Sube y analiza el paquete de facturas.', 'Pulse Generar Excel.']
    },
    {
      icon: 'monitoring',
      title: 'Analítica',
      body: 'KPIs y gráficos del workbook: año, mes, estado, importancia, asesor y tendencias. No inventa métricas.',
      route: '/app/analytics',
      routeLabel: 'Ver Analítica',
      steps: ['Combina filtros.', 'Revisa insights comerciales.', 'Exporta desempeño de asesores si lo necesitas.']
    },
    {
      icon: 'summarize',
      title: 'Reportes',
      body: 'Resumen operativo, digest comercial y descargas CSV/PDF (conversaciones, cotizaciones, ventas, reservas, clientes y asesores).',
      route: '/app/reports',
      routeLabel: 'Abrir Reportes'
    },
    {
      icon: 'group',
      title: 'Usuarios',
      body: 'Altas, roles, activar/desactivar y contraseñas. Lo ven Administrador, Gerencia y Supervisor.',
      route: '/app/users',
      routeLabel: 'Gestionar usuarios',
      steps: [
        'Crea el usuario con correo, rol y clave de 8+ caracteres.',
        'Elige el rol según los módulos que debe ver.',
        'No puedes desactivar ni borrar tu propia cuenta.'
      ]
    },
    {
      icon: 'settings',
      title: 'Configuración',
      body: 'Google Sheets, WhatsApp, apariencia, salud del sistema, usuarios y seguridad.',
      route: '/app/settings',
      routeLabel: 'Abrir Configuración',
      steps: ['Pega la URL del Apps Script en Google Sheets.', 'Sincroniza desde aquí o con Sync del topbar.', 'Revisa salud e integraciones.']
    },
    {
      icon: 'smart_toy',
      title: 'Ave, el copilot',
      body: 'Chat flotante con contexto de la pantalla. En turnos de negocio adapta el tono al DISC del prospecto. No hay consola técnica en el menú.',
      route: '/app/dashboard',
      routeLabel: 'Ir al centro de mando',
      steps: ['Ábrelo abajo a la derecha.', 'Pregunta sobre lo que estás viendo.', 'Confirma antes de ejecutar cambios.']
    },
    {
      icon: 'person',
      title: 'Mi perfil',
      body: 'Nombre, correo, avatar y preferencias de tema.',
      route: '/app/profile',
      routeLabel: 'Abrir perfil'
    },
    {
      icon: 'support_agent',
      title: 'Soporte EAS',
      body: 'Escríbenos a easpracticantes@gmail.com o al correo corporativo de tu equipo.',
      steps: ['Indica el módulo (Registro, Contabilidad, Usuarios…).', 'Adjunta captura y hora.', 'Di con qué usuario entraste.']
    }
  ];

  readonly faqs = [
    {
      q: '¿Cómo inicio sesión?',
      a: 'Con usuario del equipo o Google autorizado. Si no entra, pide a un administrador que revise tu cuenta en Usuarios.'
    },
    {
      q: '¿Por qué no veo datos nuevos?',
      a: 'Pulsa Sync en el topbar o ve a Configuración → Google Sheets y sincroniza el workbook.'
    },
    {
      q: '¿Dónde exporto un listado?',
      a: 'En Reportes: CSV/PDF de conversaciones, cotizaciones, ventas, reservas, clientes y desempeño de asesores. Analítica también exporta asesores.'
    },
    {
      q: '¿Cómo entra un chat de WhatsApp al Excel?',
      a: 'En Registro sube uno o varios .txt o un zip (hasta 50). Revisa el preview, ajusta DISC y Registrada si hace falta, y confirma. Nada se escribe hasta que confirmas.'
    },
    {
      q: '¿Qué significan los colores DISC?',
      a: 'Rojo es dominante, Amarillo influencia, Verde estabilidad y Azul cumplimiento. La IA los sugiere desde el chat del prospecto; no pisa un DISC que ya esté en Excel.'
    },
    {
      q: '¿Dónde cambio el tema oscuro?',
      a: 'Desde el topbar, en Mi perfil o en Configuración → Apariencia.'
    }
  ];

  readonly shortcuts = [
    { keys: 'Ctrl / ⌘ K', action: 'Buscar módulos, clientes y chats' },
    { keys: 'Esc', action: 'Cerrar diálogos abiertos' }
  ];

  filteredTopics() {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.topics;
    return this.topics.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        t.body.toLowerCase().includes(term) ||
        (t.steps ?? []).some((s) => s.toLowerCase().includes(term))
    );
  }

  toggleFaq(index: number): void {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }
}
