export type ClientSegment = 'NUEVO' | 'FRECUENTE' | 'VIP' | 'INACTIVO';

/** Mirrors the backend `ClientDto` record exactly; also used as the UI view model. */
export interface Client {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  segment: ClientSegment;
  source?: string | null;
  notes?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  tags: string[];
  createdAt: string;
  lastContactAt?: string | null;
}

export interface ClientCreateRequest {
  name: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  segment?: ClientSegment;
  source?: string;
  notes?: string;
  assignedUserId?: string;
  tags?: string[];
}

export type ClientUpdateRequest = Partial<ClientCreateRequest>;
