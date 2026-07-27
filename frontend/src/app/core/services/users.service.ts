import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
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

  getById(id: string): Observable<UserDto | undefined> {
    return this.api.get<UserDto>(`/users/${id}`).pipe(catchError(() => of(undefined)));
  }

  create(request: UserCreateRequest): Observable<UserDto | null> {
    return this.api.post<UserDto>('/users', request).pipe(catchError(() => of(null)));
  }

  update(id: string, request: UserUpdateRequest): Observable<UserDto | null> {
    return this.api.put<UserDto>(`/users/${id}`, request).pipe(catchError(() => of(null)));
  }

  remove(id: string): Observable<boolean> {
    return this.api.delete<void>(`/users/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
