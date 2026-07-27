import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { UserDto } from '../models/user.model';
import { ApiService } from './api.service';

export interface ProfileUpdateRequest {
  fullName?: string;
  email?: string;
  avatarUrl?: string;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(ApiService);

  getProfile(): Observable<UserDto | null> {
    return this.api.get<UserDto>('/profile').pipe(catchError(() => of(null)));
  }

  updateProfile(request: ProfileUpdateRequest): Observable<UserDto> {
    return this.api.put<UserDto>('/profile', request).pipe(catchError((err) => throwError(() => err)));
  }
}
