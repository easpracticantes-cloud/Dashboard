import { AfterViewInit, Component, ElementRef, NgZone, ViewChild, inject, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';
import { AppConfigService } from '../../../core/services/app-config.service';
import type { GoogleTokenClient, GoogleTokenResponse } from '../../../core/types/google-accounts';

const LAST_USER_KEY = 'sig_last_username';

@Component({
  selector: 'eas-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
    BrandLogoComponent
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class LoginComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly appConfig = inject(AppConfigService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly fb = inject(FormBuilder);

  private googleTokenClient: GoogleTokenClient | null = null;

  @ViewChild('userInput') private userInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);
  readonly googleLoading = signal(false);
  readonly success = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly capsLockOn = signal(false);
  readonly googleEnabled = signal(!!this.appConfig.googleClientId?.trim());
  readonly googleReady = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: [localStorage.getItem(LAST_USER_KEY) ?? '', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    rememberMe: [localStorage.getItem(LAST_USER_KEY) !== null]
  });

  get username() {
    return this.form.controls.username;
  }

  get password() {
    return this.form.controls.password;
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.userInput?.nativeElement?.focus());
    if (this.googleEnabled()) {
      this.initGoogleSignIn();
    }
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  onPasswordKey(event: KeyboardEvent): void {
    this.capsLockOn.set(event.getModifierState?.('CapsLock') ?? false);
  }

  submit(): void {
    if (this.loading() || this.success()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.loading.set(true);
    const { username, password, rememberMe } = this.form.getRawValue();

    this.auth.login({ username: username.trim(), password, rememberMe }).subscribe({
      next: () => {
        this.loading.set(false);
        if (rememberMe) {
          localStorage.setItem(LAST_USER_KEY, username.trim());
        } else {
          localStorage.removeItem(LAST_USER_KEY);
        }
        this.enterApp();
      },
      error: (err) => {
        this.loading.set(false);
        this.password.reset('');
        this.errorMessage.set(this.describeLoginError(err));
      }
    });
  }

  private enterApp(): void {
    this.success.set(true);
    setTimeout(() => {
      void this.router.navigate(['/app/dashboard']);
    }, 650);
  }

  private describeLoginError(err: { status?: number; error?: { message?: string } }): string {
    const backendMsg = err?.error?.message;
    if (err?.status === 401 || err?.status === 400) {
      return backendMsg ?? 'Usuario o contraseña incorrectos.';
    }
    if (err?.status === 403) {
      return backendMsg ?? 'Tu cuenta está inactiva. Contacta a un administrador.';
    }
    if (err?.status === 429) {
      return 'Demasiados intentos. Espera un momento antes de reintentar.';
    }
    return backendMsg ?? 'No se pudo iniciar sesión. Intenta de nuevo en unos segundos.';
  }

  signInWithGoogle(): void {
    if (this.googleLoading() || this.success()) {
      return;
    }
    if (!this.googleEnabled()) {
      this.errorMessage.set(
        'Falta configurar el Google Client ID. Revisa documentos/google-login-setup.md'
      );
      return;
    }
    if (!this.googleTokenClient) {
      this.errorMessage.set('Google aún se está cargando. Espera un segundo e intenta de nuevo.');
      this.initGoogleSignIn();
      return;
    }

    this.errorMessage.set(null);
    this.googleLoading.set(true);
    try {
      this.googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch {
      this.googleLoading.set(false);
      this.errorMessage.set('No se pudo abrir el acceso con Google. Recarga la página.');
    }
  }

  private initGoogleSignIn(attempt = 0): void {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      if (attempt < 25) {
        setTimeout(() => this.initGoogleSignIn(attempt + 1), 200);
      }
      return;
    }

    this.googleTokenClient = oauth2.initTokenClient({
      client_id: this.appConfig.googleClientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (response) => this.handleGoogleToken(response),
      error_callback: (error) => {
        this.zone.run(() => {
          this.googleLoading.set(false);
          if (error?.type === 'popup_closed') {
            this.errorMessage.set(null);
            return;
          }
          this.errorMessage.set(error?.message || 'No se completó el inicio de sesión con Google.');
        });
      }
    });
    this.googleReady.set(true);
  }

  private handleGoogleToken(response: GoogleTokenResponse): void {
    this.zone.run(() => {
      if (response?.error || !response?.access_token) {
        this.googleLoading.set(false);
        if (response?.error === 'access_denied' || response?.error === 'popup_closed_by_user') {
          this.errorMessage.set(null);
          return;
        }
        this.errorMessage.set(response?.error_description || 'No se recibió acceso de Google.');
        return;
      }

      this.auth.googleLogin({ accessToken: response.access_token }).subscribe({
        next: () => {
          this.googleLoading.set(false);
          this.enterApp();
        },
        error: (err) => {
          this.googleLoading.set(false);
          const backendMsg = err?.error?.message as string | undefined;
          this.errorMessage.set(
            backendMsg ?? 'Esta cuenta de Google no está autorizada para ingresar al SIG.'
          );
        }
      });
    });
  }
}
