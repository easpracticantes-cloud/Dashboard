import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'eas-ai',
  standalone: true,
  imports: [MatIconModule, PageHeaderComponent],
  templateUrl: './ai.component.html',
  styleUrl: './ai.component.scss'
})
export class AiComponent {
  readonly features = [
    {
      icon: 'summarize',
      title: 'Resumen inteligente de conversaciones',
      description: 'Síntesis automática de hilos largos de WhatsApp listos para el equipo.'
    },
    {
      icon: 'priority_high',
      title: 'Clasificación automática de prioridades',
      description: 'Detecta urgencias VIP y casos críticos antes de que se pierdan.'
    },
    {
      icon: 'mood',
      title: 'Análisis de sentimientos',
      description: 'Identifica tono positivo, neutro o de riesgo en cada interacción.'
    },
    {
      icon: 'notification_important',
      title: 'Detección de clientes urgentes',
      description: 'Alertas cuando un viajero requiere atención inmediata.'
    },
    {
      icon: 'recommend',
      title: 'Recomendaciones comerciales',
      description: 'Sugiere experiencias, upsells y siguientes pasos de venta.'
    },
    {
      icon: 'trending_up',
      title: 'Predicción de compra',
      description: 'Estima qué clientes tienen mayor probabilidad de cerrar.'
    },
    {
      icon: 'chat',
      title: 'Sugerencias para WhatsApp',
      description: 'Borradores de respuesta alineados al tono de Escuela Aves Salento.'
    },
    {
      icon: 'crisis_alert',
      title: 'Alertas inteligentes',
      description: 'Avisos predictivos de abandono, demoras o picos de demanda.'
    },
    {
      icon: 'insights',
      title: 'Indicadores predictivos',
      description: 'KPIs anticipados de reservas, conversión y carga del equipo.'
    }
  ];
}
