export type ConversationStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'ARCHIVED';
export type ConversationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ChannelType = 'WHATSAPP' | 'EMAIL' | 'WEB';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type SenderType = 'CLIENT' | 'AGENT' | 'SYSTEM';

/** Mirrors the backend `ConversationDto` record exactly. */
export interface ConversationDto {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatarUrl?: string | null;
  clientPhone?: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  importance: number;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  unreadCount: number;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  labels: string[];
  category?: string | null;
  notes?: string | null;
  channel: ChannelType;
  createdAt: string;
}

/** Mirrors the backend `MessageDto` record exactly. */
export interface MessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  sentAt: string;
  senderType: SenderType;
  agentUserId?: string | null;
  agentUserName?: string | null;
}

export interface ConversationTag {
  id: string;
  label: string;
  color: string;
}

/** UI-friendly view model consumed by components and shared widgets. */
export interface Conversation {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientAvatarUrl?: string | null;
  channel: ChannelType;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: ConversationStatus;
  priority: ConversationPriority;
  importance: number;
  tags: ConversationTag[];
  assignedUserId?: string | null;
  assigneeName?: string | null;
  category?: string | null;
  notes?: string | null;
  isImportant: boolean;
  isNewClient: boolean;
  isFrequentClient: boolean;
  createdAt: string;
}

export interface ConversationFilters {
  search?: string;
  status?: ConversationStatus | 'TODOS';
  priority?: ConversationPriority | 'TODOS';
  assignedUserId?: string | 'TODOS';
  tag?: string | 'TODOS';
}

const TAG_PALETTE = ['#2F8F6B', '#1B5E45', '#C4A35A', '#5CBC95', '#C45C4A', '#0B3D2E', '#3E7D5E'];

export function tagColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash + label.charCodeAt(i) * (i + 1)) % TAG_PALETTE.length;
  }
  return TAG_PALETTE[hash];
}

export function mapConversationDto(dto: ConversationDto): Conversation {
  return {
    id: dto.id,
    clientId: dto.clientId,
    clientName: dto.clientName,
    clientPhone: dto.clientPhone ?? '',
    clientAvatarUrl: dto.clientAvatarUrl,
    channel: dto.channel,
    lastMessage: dto.lastMessagePreview ?? '',
    lastMessageAt: dto.lastMessageAt ?? dto.createdAt,
    unreadCount: dto.unreadCount,
    status: dto.status,
    priority: dto.priority,
    importance: dto.importance,
    tags: (dto.labels ?? []).map((label) => ({ id: label, label, color: tagColor(label) })),
    assignedUserId: dto.assignedUserId,
    assigneeName: dto.assignedUserName,
    category: dto.category ?? dto.labels?.[0] ?? null,
    notes: dto.notes ?? null,
    isImportant: dto.importance >= 3 || dto.priority === 'HIGH' || dto.priority === 'URGENT',
    isNewClient: false,
    isFrequentClient: false,
    createdAt: dto.createdAt
  };
}
