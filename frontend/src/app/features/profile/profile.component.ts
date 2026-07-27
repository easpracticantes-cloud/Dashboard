import { Component, OnInit, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { mapUserDtoToAuthUser, UserDto } from '../../core/models/user.model';
import { ROLE_LABELS } from '../../core/models/role.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Samuel',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Laura',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jorge',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Valentina',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Andres',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Camila',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mateo',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sofia'
];

const PREFS_KEY = 'eas-profile-prefs';

interface ProfilePrefs {
  density: 'comfortable' | 'compact';
  language: 'es' | 'en';
  emailDigest: boolean;
  soundAlerts: boolean;
}

@Component({
  selector: 'eas-profile',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, MatIconModule, PageHeaderComponent, AvatarComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  readonly theme = inject(ThemeService);
  private readonly notifications = inject(NotificationsService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  readonly hidePassword = signal(true);
  readonly profileDto = signal<UserDto | null>(null);
  readonly prefs = signal<ProfilePrefs>(this.readPrefs());
  readonly roleLabels = ROLE_LABELS;
  readonly avatarPresets = AVATAR_PRESETS;

  readonly user = this.auth.currentUser;
  readonly unread = computed(() => this.notifications.unreadCount());

  readonly shortcuts = [
    { keys: 'Ctrl K', action: 'Abrir búsqueda / command palette' },
    { keys: 'Enter', action: 'Enviar mensaje en el chat' },
    { keys: 'Esc', action: 'Cerrar diálogos y paletas' }
  ];

  readonly quickLinks = [
    { icon: 'notifications', label: 'Notificaciones', route: '/app/notifications', hint: 'Avisos del sistema' },
    { icon: 'settings', label: 'Configuración', route: '/app/settings', hint: 'Sheets, WhatsApp y más' },
    { icon: 'forum', label: 'Seguimiento', route: '/app/conversations', hint: 'Inbox operativo' },
    { icon: 'dashboard', label: 'Dashboard', route: '/app/dashboard', hint: 'Pulso del negocio' }
  ];

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email]],
    avatarUrl: [''],
    password: ['', [Validators.minLength(8)]],
    confirmPassword: ['']
  });

  ngOnInit(): void {
    this.notifications.load().subscribe();
    this.profileService.getProfile().subscribe((dto) => {
      this.loading.set(false);
      if (dto) {
        this.profileDto.set(dto);
        this.auth.updateCurrentUser(mapUserDtoToAuthUser(dto));
        this.form.patchValue({
          fullName: dto.fullName,
          email: dto.email,
          avatarUrl: dto.avatarUrl ?? ''
        });
      } else if (this.user()) {
        this.form.patchValue({
          fullName: this.user()!.nombre,
          email: this.user()!.correo,
          avatarUrl: this.user()!.avatarUrl ?? ''
        });
      }
    });
  }

  get fullName() {
    return this.form.controls.fullName;
  }

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  selectPreset(url: string): void {
    this.form.patchValue({ avatarUrl: url });
  }

  clearAvatar(): void {
    this.form.patchValue({ avatarUrl: '' });
  }

  togglePassword(): void {
    this.hidePassword.update((v) => !v);
  }

  setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }

  patchPrefs(partial: Partial<ProfilePrefs>): void {
    const next = { ...this.prefs(), ...partial };
    this.prefs.set(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-density', next.density);
  }

  copyUsername(): void {
    const username = this.user()?.username;
    if (!username || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(username).then(() => {
      this.message.set({ type: 'success', text: 'Usuario copiado al portapapeles.' });
      setTimeout(() => this.message.set(null), 2000);
    });
  }

  save(): void {
    this.message.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { fullName, email, avatarUrl, password, confirmPassword } = this.form.getRawValue();
    if (password && password !== confirmPassword) {
      this.message.set({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    this.saving.set(true);
    this.profileService
      .updateProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl.trim() || '',
        password: password || undefined
      })
      .subscribe({
        next: (dto) => {
          this.saving.set(false);
          if (!dto) {
            this.message.set({ type: 'error', text: 'No pudimos guardar los cambios. Inténtalo de nuevo.' });
            return;
          }
          this.profileDto.set(dto);
          this.auth.updateCurrentUser(mapUserDtoToAuthUser(dto));
          this.form.patchValue({ password: '', confirmPassword: '' });
          this.message.set({ type: 'success', text: 'Perfil actualizado correctamente.' });
          setTimeout(() => this.message.set(null), 3500);
        },
        error: (err) => {
          this.saving.set(false);
          const apiMessage = err?.error?.message || 'No pudimos guardar los cambios.';
          this.message.set({ type: 'error', text: apiMessage });
        }
      });
  }

  private readPrefs(): ProfilePrefs {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        return { density: 'comfortable', language: 'es', emailDigest: true, soundAlerts: false, ...JSON.parse(raw) };
      }
    } catch {
      /* ignore */
    }
    return { density: 'comfortable', language: 'es', emailDigest: true, soundAlerts: false };
  }
}
