import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { SettingDto, SettingUpdateItem } from '../models/settings.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(ApiService);

  getSettings(): Observable<SettingDto[]> {
    return this.api.get<SettingDto[]>('/settings').pipe(catchError(() => of([])));
  }

  updateSettings(items: SettingUpdateItem[]): Observable<SettingDto[] | null> {
    return this.api.put<SettingDto[]>('/settings', { settings: items }).pipe(catchError(() => of(null)));
  }
}
