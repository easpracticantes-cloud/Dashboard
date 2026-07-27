import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Conversation, ConversationPriority, ConversationStatus } from '../../../core/models/conversation.model';
import { UserDto } from '../../../core/models/user.model';
import { ConversationUpdateRequest } from '../../../core/services/conversations.service';

export interface ConversationEditDialogData {
  conversation: Conversation;
  advisors: UserDto[];
}

@Component({
  selector: 'eas-conversation-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  template: `
    <div class="dlg">
      <div class="dlg__head">
        <div>
          <p class="dlg__eyebrow">Editar conversación</p>
          <h2>{{ data.conversation.clientName }}</h2>
        </div>
        <button type="button" class="eas-btn-icon" (click)="cancel()" aria-label="Cerrar">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()" class="dlg__form">
        <div class="dlg__row">
          <label class="field">
            <span class="eas-field-label">Estado</span>
            <select class="eas-select" formControlName="status">
              <option value="OPEN">Abierta</option>
              <option value="PENDING">Pendiente</option>
              <option value="RESOLVED">Resuelta</option>
              <option value="ARCHIVED">Archivada</option>
            </select>
          </label>

          <label class="field">
            <span class="eas-field-label">Importancia</span>
            <select class="eas-select" formControlName="priority">
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </label>
        </div>

        <div class="dlg__row">
          <label class="field">
            <span class="eas-field-label">Categoría</span>
            <input class="eas-input eas-input--plain" formControlName="category" placeholder="Ej. Avistamiento" />
          </label>

          <label class="field">
            <span class="eas-field-label">Asesor asignado</span>
            <select class="eas-select" formControlName="assignedUserId">
              <option value="">Sin asignar</option>
              @for (advisor of data.advisors; track advisor.id) {
                <option [value]="advisor.id">{{ advisor.fullName }}</option>
              }
            </select>
          </label>
        </div>

        <label class="field">
          <span class="eas-field-label">Observaciones</span>
          <textarea
            rows="4"
            formControlName="notes"
            class="eas-textarea"
            placeholder="Notas internas del equipo comercial…"
          ></textarea>
        </label>

        <div class="dlg__actions">
          <button type="button" class="eas-btn-secondary" (click)="cancel()">Cancelar</button>
          <button type="submit" class="eas-btn-primary">
            <mat-icon>save</mat-icon>
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      .dlg {
        width: min(520px, 92vw);
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

      .dlg__row {
        display: grid;
        gap: 0.9rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .field {
        display: grid;
        gap: 0.35rem;
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
        min-height: 96px;
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
export class ConversationEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ConversationEditDialogComponent, ConversationUpdateRequest | null>);
  readonly data = inject<ConversationEditDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    status: [this.data.conversation.status, Validators.required],
    priority: [this.data.conversation.priority, Validators.required],
    category: [this.data.conversation.category ?? ''],
    assignedUserId: [this.data.conversation.assignedUserId ?? ''],
    notes: [this.data.conversation.notes ?? '']
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
      status: value.status as ConversationStatus,
      priority: value.priority as ConversationPriority,
      category: value.category.trim() || null,
      assignedUserId: value.assignedUserId || null,
      notes: value.notes.trim() || null
    });
  }
}
