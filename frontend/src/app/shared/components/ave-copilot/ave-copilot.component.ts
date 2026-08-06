import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EnterpriseAiService } from '../../../core/services/enterprise-ai.service';

interface ChatBubble {
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: string;
}

const LOCAL_FAQ: { keys: string[]; reply: string }[] = [
  {
    keys: ['hola', 'buenas', 'buenos dias', 'hey', 'saludos'],
    reply:
      '¡Hola! Soy **Ave**. Puedo ayudarte con cotizaciones, jeep, checklists y el uso del SIG. Prueba: *“¿Jeep privado o público?”*'
  },
  {
    keys: ['jeep privado', 'jeep publico', 'jeep público', 'transporte privado'],
    reply:
      '**Jeep:** más de 4 personas → **privado**; 4 o menos → **público**. Guías no pagan entrada; sí pagan almuerzo.'
  },
  {
    keys: ['como cotiz', 'cómo cotiz', 'crear cotizacion', 'crear cotización'],
    reply:
      'Ve a **Cotizaciones → Nueva**, o escríbeme: *“Cotiza Acaime para 5 con transporte y almuerzo”*.'
  },
  {
    keys: ['checklist', 'que llevar', 'qué llevar'],
    reply: 'Dime el tour (ej. Acaime) y te traigo el checklist operativo desde el SIG.'
  }
];

@Component({
  selector: 'eas-ave-copilot',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './ave-copilot.component.html',
  styleUrl: './ave-copilot.component.scss'
})
export class AveCopilotComponent {
  private readonly ai = inject(EnterpriseAiService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly bounce = signal(true);
  readonly messages = signal<ChatBubble[]>([
    {
      role: 'assistant',
      text: '¡Hola! Soy **Ave**, tu copiloto del SIG. Pregúntame por tours, cotizaciones, jeep, checklists o cómo usar el CRM.',
      mode: 'ANSWER'
    }
  ]);

  draft = '';
  private sessionId: string | null = null;

  readonly suggestions = [
    '¿Cuánto sale Acaime para 5 con transporte?',
    'Checklist del tour Acaime',
    '¿Jeep privado o público?',
    '¿Cómo creo una cotización?'
  ];

  toggle(): void {
    this.open.update((v) => !v);
    this.bounce.set(false);
    if (this.open()) {
      queueMicrotask(() => this.scrollBottom());
    }
  }

  useSuggestion(text: string): void {
    this.draft = text;
    this.send();
  }

  formatHtml(text: string): SafeHtml {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.sending()) {
      return;
    }
    this.draft = '';
    this.messages.update((m) => [...m, { role: 'user', text }]);
    this.sending.set(true);
    this.scrollBottom();

    this.ai.copilot(text, this.sessionId ?? undefined).subscribe({
      next: (res) => {
        this.sessionId = res.sessionId;
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', text: res.reply, mode: res.mode }
        ]);
        this.sending.set(false);
        this.scrollBottom();
      },
      error: (err) => {
        const local = this.localReply(text);
        if (local) {
          this.messages.update((m) => [...m, { role: 'assistant', text: local, mode: 'LOCAL' }]);
        } else {
          const apiMsg =
            (err as { error?: { message?: string; detail?: string } })?.error?.message ||
            (err as { error?: { detail?: string } })?.error?.detail ||
            '';
          const status = (err as { status?: number })?.status;
          let hint: string;
          if (status === 401 || status === 403) {
            hint =
              apiMsg ||
              'Tu sesión expiró o no tienes permiso. Cierra sesión e inicia de nuevo; luego vuelve a escribirme.';
          } else if (status === 404) {
            hint = 'El backend aún no tiene `/ai/copilot` (redeploy pendiente).';
          } else if (status === 0) {
            hint = 'No hay conexión con el API.';
          } else {
            hint = apiMsg || 'Revisa la conexión con el servidor.';
          }
          this.messages.update((m) => [
            ...m,
            {
              role: 'system',
              text: `No pude hablar con el servidor. ${hint}`
            }
          ]);
        }
        this.sending.set(false);
        this.scrollBottom();
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private localReply(text: string): string | null {
    const n = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    for (const faq of LOCAL_FAQ) {
      if (faq.keys.some((k) => n.includes(k.normalize('NFD').replace(/\p{M}/gu, '')))) {
        return faq.reply;
      }
    }
    return null;
  }

  private scrollBottom(): void {
    queueMicrotask(() => {
      const el = this.scroller?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
