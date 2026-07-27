import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { Client, ClientCreateRequest, ClientUpdateRequest } from '../models/client.model';
import { PageResponse } from '../models/common.model';
import { ApiService } from './api.service';

export interface ClientListResult {
  items: Client[];
  totalElements: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly api = inject(ApiService);

  list(page = 0, size = 200, search?: string): Observable<ClientListResult> {
    return this.api.get<PageResponse<Client>>('/clients', { page, size }).pipe(
      map((res) => ({
        items: search ? res.content.filter((client) => matchesSearch(client, search)) : res.content,
        totalElements: res.totalElements,
        totalPages: res.totalPages
      })),
      catchError(() => of({ items: [], totalElements: 0, totalPages: 0 }))
    );
  }

  getById(id: string): Observable<Client | undefined> {
    return this.api.get<Client>(`/clients/${id}`).pipe(catchError(() => of(undefined)));
  }

  create(request: ClientCreateRequest): Observable<Client | null> {
    return this.api.post<Client>('/clients', request).pipe(catchError(() => of(null)));
  }

  update(id: string, request: ClientUpdateRequest): Observable<Client | null> {
    return this.api.put<Client>(`/clients/${id}`, request).pipe(catchError(() => of(null)));
  }

  remove(id: string): Observable<boolean> {
    return this.api.delete<void>(`/clients/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}

function matchesSearch(client: Client, term: string): boolean {
  const value = term.toLowerCase();
  return (
    client.name.toLowerCase().includes(value) ||
    (client.phone ?? '').toLowerCase().includes(value) ||
    (client.email ?? '').toLowerCase().includes(value)
  );
}
