import { RoleCode } from './role.model';

/** Mirrors the backend `UserDto` record exactly. */
export interface UserDto {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role: RoleCode;
  active: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

/** UI-friendly view model used throughout the app (session, sidebar, topbar). */
export interface AuthUser {
  id: string;
  nombre: string;
  correo: string;
  username: string;
  rol: RoleCode;
  avatarUrl?: string | null;
  activo?: boolean;
  ultimoAcceso?: string | null;
}

export function mapUserDtoToAuthUser(dto: UserDto): AuthUser {
  return {
    id: dto.id,
    nombre: dto.fullName,
    correo: dto.email,
    username: dto.username,
    rol: dto.role,
    avatarUrl: dto.avatarUrl,
    activo: dto.active,
    ultimoAcceso: dto.lastLoginAt
  };
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  refreshToken?: string | null;
  tokenType: string;
  expiresInMinutes: number;
  user: UserDto;
}
