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
      icon: 'table_chart',
      title: 'Registro del Excel',
      body: 'Agrega o edita filas del workbook (fecha, cliente, semáforo, prioridad) y se guarda en la hoja.',
      route: '/app/registro',
      routeLabel: 'Ir a Registro',
      steps: [
        'Abre Registro y elige la hoja.',
        'Pulsa Nueva fila o Editar.',
        'Guarda para escribir en Google Sheets.'
      ]
    },
    {
      icon: 'grid_on',
      title: 'Google Sheets',
      body: 'Configura el Web App URL y sincroniza para proyectar clientes, chats y comercial.',
      route: '/app/settings',
      routeLabel: 'Abrir Configuración',
      steps: [
        'Ve a Configuración → Google Sheets.',
        'Pega la URL del Apps Script.',
        'Pulsa Sincronizar ahora (o usa el botón del topbar).'
      ]
    },
    {
      icon: 'monitoring',
      title: 'Analítica',
      body: 'Combina año, mes, estado e importancia para leer el negocio en tiempo real.',
      route: '/app/analytics',
      routeLabel: 'Ver Analítica'
    },
    {
      icon: 'request_quote',
      title: 'Pipeline comercial',
      body: 'Clona cotizaciones, extiende validez, convierte a reserva y luego a venta.',
      route: '/app/registro',
      routeLabel: 'Ver Registro'
    },
    {
      icon: 'auto_awesome',
      title: 'Asistente de IA',
      body: 'En cada chat puedes sugerir respuesta, resumir y generar cotización en PDF.',
      route: '/app/registro',
      routeLabel: 'Abrir registro'
    },
    {
      icon: 'person',
      title: 'Mi perfil',
      body: 'Actualiza nombre, correo, avatar, tema y preferencias de densidad.',
      route: '/app/profile',
      routeLabel: 'Abrir perfil'
    },
    {
      icon: 'security',
      title: 'Roles y permisos',
      body: 'ADMINISTRADOR, GERENCIA, COMERCIAL, CONTABILIDAD y OPERACIONES controlan el acceso.',
      route: '/app/users',
      routeLabel: 'Gestionar usuarios'
    },
    {
      icon: 'support_agent',
      title: 'Soporte Escuela Aves',
      body: 'Escríbenos a escuelaavescomercial@gmail.com, easpracticantes@gmail.com o escuelaavesdesalento@gmail.com.',
      steps: ['Describe el módulo afectado.', 'Incluye captura y hora del incidente.', 'Indica el usuario con el que ingresaste.']
    }
  ];

  readonly faqs = [
    {
      q: '¿Cómo inicio sesión?',
      a: 'Solo con Google. Usa escuelaavescomercial@gmail.com, easpracticantes@gmail.com o escuelaavesdesalento@gmail.com.'
    },
    {
      q: '¿Por qué no veo datos nuevos?',
      a: 'Pulsa el botón Sync del topbar o sincroniza en Configuración → Google Sheets.'
    },
    {
      q: '¿Cómo exporto un listado?',
      a: 'En Clientes, Cotizaciones, Reservas y Ventas hay un botón Exportar CSV.'
    },
    {
      q: '¿Cómo genero una cotización desde un chat?',
      a: 'Abre la conversación, acepta el banner de IA o usa Cotizar con IA, edita el borrador y descarga el PDF.'
    },
    {
      q: '¿Dónde cambio el tema oscuro?',
      a: 'Desde el topbar, en Mi perfil → Preferencias, o en Configuración → Apariencia.'
    }
  ];

  readonly shortcuts = [
    { keys: 'Ctrl / ⌘ K', action: 'Command palette (buscar módulos, clientes y chats)' },
    { keys: 'Enter', action: 'Enviar mensaje en el hilo de conversación' },
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
