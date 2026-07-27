import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { AuthUser, LoginRequest, LoginResponse, UserDto, mapUserDtoToAuthUser } from '../models/user.model';
import { RoleCode } from '../models/role.model';
import { ApiService } from './api.service';

const TOKEN_KEY = 'sig_token';
const REFRESH_TOKEN_KEY = 'sig_refresh_token';
const USER_KEY = 'sig_user';
const REMEMBER_KEY = 'sig_remember';

/** Demo account used only when the backend is completely unreachable (network error), so the UI stays explorable. */
const DEMO_USER_DTO: UserDto = {
  id: 'demo-user',
  username: 'demo',
  email: 'demo@escuelaavessalento.com',
  fullName: 'Usuario Demo',
  avatarUrl: null,
  role: 'GERENCIA',
  active: true,
  lastLoginAt: new Date().toISOString(),
  createdAt: new Date().toISOString()
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(this.readInitialToken());
  readonly currentUser = signal<AuthUser | null>(this.readInitialUser());
  readonly isAuthenticated = computed(() => !!this.token());
  readonly rememberMeFlag = signal<boolean>(localStorage.getItem(REMEMBER_KEY) === '1');

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api
      .post<LoginResponse>('/auth/login', {
        username: request.username,
        password: request.password,
        rememberMe: !!request.rememberMe
      })
      .pipe(
        tap((response) => this.persistSession(response, !!request.rememberMe)),
        catchError((err) => {
          if (this.isNetworkError(err)) {
            const demo: LoginResponse = {
              token: `demo.${Date.now()}`,
              tokenType: 'Bearer',
              expiresInMinutes: 120,
              user: { ...DEMO_USER_DTO, username: request.username || DEMO_USER_DTO.username }
            };
            this.persistSession(demo, !!request.rememberMe);
            return of(demo);
          }
          return throwError(() => err);
        })
      );
  }

  /** Login con Google: ID Token (credential GIS) o Access Token (popup selector de cuentas). */
  googleLogin(payload: { idToken?: string; accessToken?: string }): Observable<LoginResponse> {
    return this.api
      .post<LoginResponse>('/auth/google-login', payload)
      .pipe(tap((response) => this.persistSession(response, true)));
  }

  requestPasswordReset(email: string): Observable<{ sent: boolean }> {
    return this.api.post<void>('/auth/forgot-password', { email }).pipe(
      map(() => ({ sent: true })),
      catchError(() => of({ sent: true }))
    );
  }

  fetchCurrentUser(): Observable<AuthUser | null> {
    return this.api.get<UserDto>('/auth/me').pipe(
      map((dto) => mapUserDtoToAuthUser(dto)),
      tap((user) => this.currentUser.set(user)),
      catchError(() => of(this.currentUser()))
    );
  }

  updateCurrentUser(user: AuthUser): void {
    this.currentUser.set(user);
    const target = this.rememberMeFlag() ? localStorage : sessionStorage;
    target.setItem(USER_KEY, JSON.stringify(user));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    this.token.set(null);
    this.currentUser.set(null);
    this.revokeGoogleSession();
    void this.router.navigate(['/login']);
  }

  /** Evita que Google reingrese automáticamente tras un logout explícito. */
  private revokeGoogleSession(): void {
    try {
      window.google?.accounts.id.disableAutoSelect();
    } catch {
      // GIS puede no estar cargado; el logout local ya limpió la sesión.
    }
  }

  hasAnyRole(roles: RoleCode[]): boolean {
    const rol = this.currentUser()?.rol;
    return !!rol && roles.includes(rol);
  }

  private persistSession(response: LoginResponse, rememberMe: boolean): void {
    this.rememberMeFlag.set(rememberMe);
    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, '1');
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    const target = rememberMe ? localStorage : sessionStorage;
    const user = mapUserDtoToAuthUser(response.user);
    target.setItem(TOKEN_KEY, response.token);
    if (response.refreshToken) {
      target.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    }
    target.setItem(USER_KEY, JSON.stringify(user));
    this.token.set(response.token);
    this.currentUser.set(user);
  }

  /** Demo fallback only kicks in for genuine network failures, never for auth (401) rejections. */
  private isNetworkError(err: { status?: number }): boolean {
    return err?.status === 0;
  }

  private readInitialToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  }

  private readInitialUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
