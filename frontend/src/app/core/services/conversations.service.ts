import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { PageResponse } from '../models/common.model';
import {
  ChannelType,
  Conversation,
  ConversationDto,
  ConversationPriority,
  ConversationStatus,
  MessageDto,
  mapConversationDto
} from '../models/conversation.model';
import { ApiService } from './api.service';

export interface ConversationListResult {
  items: Conversation[];
  totalElements: number;
  totalPages: number;
}

export interface ConversationCreateRequest {
  clientId: string;
  priority?: ConversationPriority;
  importance?: number;
  assignedUserId?: string;
  labels?: string[];
  channel?: ChannelType;
  initialMessage?: string;
}

export interface ConversationUpdateRequest {
  status?: ConversationStatus;
  priority?: ConversationPriority;
  importance?: number;
  assignedUserId?: string | null;
  category?: string | null;
  notes?: string | null;
  labels?: string[];
}

@Injectable({ providedIn: 'root' })
export class ConversationsService {
  private readonly api = inject(ApiService);

  list(page = 0, size = 200): Observable<ConversationListResult> {
    return this.api.get<PageResponse<ConversationDto>>('/conversations', { page, size }).pipe(
      map((res) => ({
        items: (res.content ?? []).map(mapConversationDto),
        totalElements: res.totalElements ?? 0,
        totalPages: res.totalPages ?? 0
      })),
      catchError(() => of({ items: [], totalElements: 0, totalPages: 0 }))
    );
  }

  /** Carga todas las páginas para que filtros de año (p. ej. 2026) vean el 100% del inbox. */
  listAll(pageSize = 500): Observable<ConversationListResult> {
    return this.list(0, pageSize).pipe(
      switchMap((first) => {
        const totalPages = Math.max(first.totalPages || 1, 1);
        if (totalPages <= 1) {
          return of({
            items: first.items,
            totalElements: first.totalElements || first.items.length,
            totalPages: 1
          });
        }
        const requests = Array.from({ length: totalPages - 1 }, (_, i) => this.list(i + 1, pageSize));
        return forkJoin(requests).pipe(
          map((pages) => {
            const items = [...first.items, ...pages.flatMap((p) => p.items)];
            return {
              items,
              totalElements: first.totalElements || items.length,
              totalPages
            };
          })
        );
      })
    );
  }

  getById(id: string): Observable<Conversation | undefined> {
    return this.api.get<ConversationDto>(`/conversations/${id}`).pipe(
      map(mapConversationDto),
      catchError(() => of(undefined))
    );
  }

  getThread(id: string): Observable<MessageDto[]> {
    return this.api.get<MessageDto[]>(`/conversations/${id}/messages`).pipe(catchError(() => of([])));
  }

  sendMessage(id: string, body: string): Observable<MessageDto | null> {
    return this.api.post<MessageDto>(`/conversations/${id}/messages`, { body }).pipe(catchError(() => of(null)));
  }

  updateStatus(id: string, status: Conversation['status']): Observable<Conversation | null> {
    return this.api.patch<ConversationDto>(`/conversations/${id}/status`, { status }).pipe(
      map(mapConversationDto),
      catchError(() => of(null))
    );
  }

  updatePriority(id: string, priority: Conversation['priority']): Observable<Conversation | null> {
    return this.api.patch<ConversationDto>(`/conversations/${id}/priority`, { priority }).pipe(
      map(mapConversationDto),
      catchError(() => of(null))
    );
  }

  assign(id: string, assignedUserId: string): Observable<Conversation | null> {
    return this.api.patch<ConversationDto>(`/conversations/${id}/assign`, { assignedUserId }).pipe(
      map(mapConversationDto),
      catchError(() => of(null))
    );
  }

  create(request: ConversationCreateRequest): Observable<Conversation | null> {
    return this.api.post<ConversationDto>('/conversations', request).pipe(
      map(mapConversationDto),
      catchError(() => of(null))
    );
  }

  update(id: string, request: ConversationUpdateRequest): Observable<Conversation | null> {
    return this.api.put<ConversationDto>(`/conversations/${id}`, request).pipe(
      map(mapConversationDto),
      catchError(() => of(null))
    );
  }

  remove(id: string): Observable<boolean> {
    return this.api.delete<void>(`/conversations/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
}
