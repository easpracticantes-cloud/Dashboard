import { Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'eas-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule, MatProgressSpinnerModule, BrandLogoComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly sent = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  get email() {
    return this.form.controls.email;
  }

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.auth.requestPasswordReset(this.form.getRawValue().email).subscribe(() => {
      this.loading.set(false);
      this.sent.set(true);
    });
  }
}
