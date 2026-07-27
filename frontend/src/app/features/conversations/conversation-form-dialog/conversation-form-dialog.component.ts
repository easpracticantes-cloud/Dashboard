import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Client } from '../../../core/models/client.model';
import { ConversationPriority } from '../../../core/models/conversation.model';

export interface ConversationFormDialogData {
  clients: Client[];
}

export interface ConversationFormResult {
  clientId: string;
  priority: ConversationPriority;
  initialMessage: string;
}

@Component({
  selector: 'eas-conversation-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  template: `
    <div class="dlg">
      <div class="dlg__head">
        <div>
          <p class="dlg__eyebrow">Bandeja</p>
          <h2>Nueva conversación</h2>
        </div>
        <button type="button" class="eas-btn-icon" (click)="cancel()" aria-label="Cerrar">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()" class="dlg__form">
        <label class="field">
          <span class="eas-field-label">Cliente</span>
          <select class="eas-select" formControlName="clientId">
            <option value="" disabled>Selecciona un cliente</option>
            @for (client of data.clients; track client.id) {
              <option [value]="client.id">{{ client.name }} · {{ client.phone }}</option>
            }
          </select>
          @if (form.controls.clientId.invalid && form.controls.clientId.touched) {
            <small>Selecciona un cliente.</small>
          }
        </label>

        <label class="field">
          <span class="eas-field-label">Prioridad</span>
          <select class="eas-select" formControlName="priority">
            <option value="LOW">Baja</option>
            <option value="MEDIUM">Media</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </label>

        <label class="field">
          <span class="eas-field-label">Mensaje inicial (opcional)</span>
          <textarea
            rows="3"
            formControlName="initialMessage"
            class="eas-textarea"
            placeholder="Ej: Hola, ¿deseas cotizar un plan de avistamiento?"
          ></textarea>
        </label>

        <div class="dlg__actions">
          <button type="button" class="eas-btn-secondary" (click)="cancel()">Cancelar</button>
          <button type="submit" class="eas-btn-primary">
            <mat-icon>add_comment</mat-icon>
            Crear conversación
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      .dlg {
        width: min(480px, 92vw);
        padding: 1.25rem 1.3rem 1.35rem;
      }

      .dlg__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .dlg__eyebrow {
        margin: 0;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--eas-leaf);
      }

      .dlg__head h2 {
        margin: 0.2rem 0 0;
        font-size: 1.25rem;
      }

      .dlg__form {
        display: grid;
        gap: 0.9rem;
      }

      .field {
        display: grid;
        gap: 0.35rem;
      }

      .field small {
        color: var(--eas-danger);
        font-size: 0.75rem;
      }

      .eas-textarea {
        width: 100%;
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--eas-line);
        border-radius: 11px;
        background: var(--eas-surface);
        font: inherit;
        font-size: 0.875rem;
        resize: vertical;
        min-height: 84px;
      }

      .eas-textarea:focus {
        outline: none;
        border-color: var(--eas-leaf);
        box-shadow: 0 0 0 3px rgba(31, 122, 76, 0.12);
      }

      .eas-select {
        width: 100%;
      }

      .dlg__actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.55rem;
        margin-top: 0.35rem;
      }

      .dlg__actions .eas-btn-primary mat-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
      }
    `
  ]
})
export class ConversationFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ConversationFormDialogComponent, ConversationFormResult | null>);
  readonly data = inject<ConversationFormDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    clientId: ['', Validators.required],
    priority: ['MEDIUM' as ConversationPriority, Validators.required],
    initialMessage: ['']
  });

  cancel(): void {
    this.dialogRef.close(null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      clientId: value.clientId,
      priority: value.priority,
      initialMessage: value.initialMessage.trim()
    });
  }
}
