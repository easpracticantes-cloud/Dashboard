import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Client, ClientSegment } from '../../../core/models/client.model';

export interface ClientFormDialogData {
  client?: Client;
}

@Component({
  selector: 'eas-client-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './client-form-dialog.component.html'
})
export class ClientFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ClientFormDialogComponent>);
  readonly data = inject<ClientFormDialogData>(MAT_DIALOG_DATA);

  readonly segments: ClientSegment[] = ['NUEVO', 'FRECUENTE', 'VIP', 'INACTIVO'];

  readonly form = this.fb.nonNullable.group({
    name: [this.data.client?.name ?? '', [Validators.required]],
    email: [this.data.client?.email ?? '', [Validators.email]],
    phone: [this.data.client?.phone ?? '', [Validators.required]],
    notes: [this.data.client?.notes ?? ''],
    segment: [this.data.client?.segment ?? ('NUEVO' as ClientSegment), [Validators.required]]
  });

  get isEdit(): boolean {
    return !!this.data.client;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(this.form.getRawValue());
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
