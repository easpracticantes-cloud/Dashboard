import { Component, HostListener, inject } from '@angular/core';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

@Component({
  selector: 'eas-ui-feedback-modal',
  standalone: true,
  template: `
    @if (feedback.current(); as fb) {
      <div
        class="ufm"
        role="presentation"
        (click)="fb.kind === 'confirm' ? feedback.dismissConfirm() : feedback.clear()"
      >
        <div
          class="ufm__panel"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="'ufm-title'"
          [attr.data-kind]="fb.kind"
          (click)="$event.stopPropagation()"
        >
          <p class="ufm__eyebrow" id="ufm-title">{{ fb.title }}</p>
          <p class="ufm__msg">{{ fb.message }}</p>
          @if (fb.kind === 'confirm') {
            <div class="ufm__actions">
              <button type="button" class="ufm__btn ufm__btn--ghost" (click)="feedback.dismissConfirm()">
                {{ fb.cancelLabel || 'Cancelar' }}
              </button>
              <button type="button" class="ufm__btn ufm__btn--danger" (click)="feedback.acceptConfirm()">
                {{ fb.confirmLabel || 'Aceptar' }}
              </button>
            </div>
          } @else {
            <button type="button" class="ufm__btn" (click)="feedback.clear()">Entendido</button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .ufm {
        position: fixed;
        inset: 0;
        z-index: 10050;
        display: grid;
        place-items: center;
        padding: 1.25rem;
        background: rgba(12, 24, 18, 0.48);
        backdrop-filter: blur(4px);
        animation: ufm-in 0.18s ease-out;
      }

      .ufm__panel {
        width: min(28rem, 100%);
        padding: 1.35rem 1.4rem 1.2rem;
        border-radius: 1rem;
        background: #f7faf8;
        border: 1px solid rgba(31, 122, 76, 0.22);
        box-shadow: 0 24px 60px rgba(8, 28, 18, 0.28);
        display: grid;
        gap: 0.85rem;
      }

      .ufm__panel[data-kind='error'],
      .ufm__panel[data-kind='confirm'] {
        border-color: rgba(176, 48, 48, 0.35);
        background: #fff8f7;
      }

      .ufm__panel[data-kind='success'] {
        border-color: rgba(31, 122, 76, 0.35);
      }

      .ufm__panel[data-kind='info'] {
        border-color: rgba(40, 90, 140, 0.28);
        background: #f6f9fc;
      }

      .ufm__eyebrow {
        margin: 0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #1f7a4c;
      }

      .ufm__panel[data-kind='error'] .ufm__eyebrow,
      .ufm__panel[data-kind='confirm'] .ufm__eyebrow {
        color: #a12828;
      }

      .ufm__panel[data-kind='info'] .ufm__eyebrow {
        color: #2a5f8f;
      }

      .ufm__msg {
        margin: 0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 1rem;
        line-height: 1.45;
        color: #1a2e24;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: min(50vh, 20rem);
        overflow: auto;
      }

      .ufm__actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.55rem;
        flex-wrap: wrap;
        margin-top: 0.15rem;
      }

      .ufm__btn {
        justify-self: end;
        margin-top: 0.15rem;
        border: 0;
        border-radius: 0.65rem;
        padding: 0.55rem 1.1rem;
        font: inherit;
        font-weight: 650;
        cursor: pointer;
        color: #fff;
        background: #1f7a4c;
      }

      .ufm__actions .ufm__btn {
        margin-top: 0;
        justify-self: auto;
      }

      .ufm__btn--ghost {
        background: transparent;
        color: #31483c;
        border: 1px solid rgba(26, 46, 36, 0.22);
      }

      .ufm__btn--danger {
        background: #a12828;
      }

      .ufm__panel[data-kind='error'] .ufm__btn {
        background: #a12828;
      }

      .ufm__panel[data-kind='info'] .ufm__btn {
        background: #2a5f8f;
      }

      .ufm__btn:focus-visible {
        outline: 2px solid #e4a01a;
        outline-offset: 2px;
      }

      @keyframes ufm-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `,
  ],
})
export class UiFeedbackModalComponent {
  readonly feedback = inject(UiFeedbackService);

  @HostListener('document:keydown.escape')
  onEsc(): void {
    const cur = this.feedback.current();
    if (!cur) return;
    if (cur.kind === 'confirm') this.feedback.dismissConfirm();
    else this.feedback.clear();
  }
}
