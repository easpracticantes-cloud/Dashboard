import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { UserDto } from '../../../core/models/user.model';
import { RoleCode, ROLE_LABELS } from '../../../core/models/role.model';

export interface UserFormDialogData {
  user?: UserDto;
}

@Component({
  selector: 'eas-user-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './user-form-dialog.component.html'
})
export class UserFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent>);
  readonly data = inject<UserFormDialogData>(MAT_DIALOG_DATA);

  readonly roles: RoleCode[] = [
    'ADMINISTRADOR',
    'SUPERVISOR',
    'ASESOR',
    'GERENCIA',
    'COMERCIAL',
    'CONTABILIDAD',
    'OPERACIONES'
  ];
  readonly roleLabels = ROLE_LABELS;

  readonly form = this.fb.nonNullable.group({
    username: [this.data.user?.username ?? '', [Validators.required]],
    email: [this.data.user?.email ?? '', [Validators.required, Validators.email]],
    fullName: [this.data.user?.fullName ?? '', [Validators.required]],
    role: [this.data.user?.role ?? ('OPERACIONES' as RoleCode), [Validators.required]],
    active: [this.data.user?.active ?? true],
    password: ['']
  });

  get isEdit(): boolean {
    return !!this.data.user;
  }

  save(): void {
    if (!this.isEdit) {
      this.form.controls.password.addValidators(Validators.required);
      this.form.controls.password.updateValueAndValidity();
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({ ...value, password: value.password || undefined });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
