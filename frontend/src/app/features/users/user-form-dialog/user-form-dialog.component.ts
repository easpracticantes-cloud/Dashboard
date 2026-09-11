import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { UserDto } from '../../../core/models/user.model';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, RoleCode } from '../../../core/models/role.model';

export interface UserFormDialogData {
  user?: UserDto;
}

@Component({
  selector: 'eas-user-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './user-form-dialog.component.html',
  styleUrl: './user-form-dialog.component.scss'
})
export class UserFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent>);
  readonly data = inject<UserFormDialogData>(MAT_DIALOG_DATA);

  readonly showPassword = signal(false);
  readonly roles: RoleCode[] = [
    'ADMINISTRADOR',
    'GERENCIA',
    'SUPERVISOR',
    'COMERCIAL',
    'CONTABILIDAD',
    'OPERACIONES',
    'ASESOR'
  ];
  readonly roleLabels = ROLE_LABELS;
  readonly roleDescriptions = ROLE_DESCRIPTIONS;

  readonly form = this.fb.nonNullable.group({
    username: [
      this.data.user?.username ?? '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(60)]
    ],
    email: [this.data.user?.email ?? '', [Validators.required, Validators.email]],
    fullName: [this.data.user?.fullName ?? '', [Validators.required, Validators.maxLength(150)]],
    role: [this.data.user?.role ?? ('ASESOR' as RoleCode), [Validators.required]],
    active: [this.data.user?.active ?? true],
    password: ['']
  });

  get isEdit(): boolean {
    return !!this.data.user;
  }

  get roleHint(): string {
    return ROLE_DESCRIPTIONS[this.form.controls.role.value];
  }

  save(): void {
    if (!this.isEdit) {
      this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    } else if (this.form.controls.password.value) {
      this.form.controls.password.setValidators([Validators.minLength(8)]);
    } else {
      this.form.controls.password.clearValidators();
    }
    this.form.controls.password.updateValueAndValidity();
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
