import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { RoleCode } from '../models/role.model';
import { UserDto } from '../models/user.model';
import { ApiService } from './api.service';

export interface UserCreateRequest {
  username: string;
  email: string;
  password: string;
  fullName: string;
  avatarUrl?: string;
  role: RoleCode;
  active?: boolean;
}

export interface UserUpdateRequest {
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  role?: RoleCode;
  active?: boolean;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(ApiService);

  list(): Observable<UserDto[]> {
    return this.api.get<UserDto[]>('/users').pipe(catchError(() => of([])));
  }

  listTeam(): Observable<UserDto[]> {
    return this.api.get<UserDto[]>('/users').pipe(
      catchError((err: HttpErrorResponse) => throwError(() => this.toError(err, 'No se pudo cargar el equipo.')))
    );
  }

  getById(id: string): Observable<UserDto | undefined> {
    return this.api.get<UserDto>(`/users/${id}`).pipe(catchError(() => of(undefined)));
  }

  create(request: UserCreateRequest): Observable<UserDto> {
    return this.api
      .post<UserDto>('/users', request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.toError(err, 'No se pudo crear el usuario.'))));
  }

  update(id: string, request: UserUpdateRequest): Observable<UserDto> {
    return this.api
      .put<UserDto>(`/users/${id}`, request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => this.toError(err, 'No se pudo actualizar el usuario.'))));
  }

  remove(id: string): Observable<boolean> {
    return this.api.delete<void>(`/users/${id}`).pipe(
      map(() => true),
      catchError((err: HttpErrorResponse) => throwError(() => this.toError(err, 'No se pudo eliminar el usuario.')))
    );
  }

  private toError(err: HttpErrorResponse, fallback: string): Error {
    const body = err.error;
    const message =
      (typeof body === 'string' && body) ||
      body?.message ||
      body?.detail ||
      (err.status === 403 ? 'No tienes permiso para gestionar usuarios.' : fallback);
    return new Error(message);
  }
}
