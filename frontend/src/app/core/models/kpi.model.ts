export interface KpiItem {
  id: string;
  label: string;
  value: string | number;
  delta?: number;
  trend?: 'up' | 'down' | 'flat';
  icon?: string;
  accent?: 'forest' | 'leaf' | 'amber' | 'danger' | 'mint';
  suffix?: string;
}

/** Mirrors the backend `KpiDto` record exactly. */
export interface KpiDto {
  code: string;
  label: string;
  value: number;
  changePercent?: number | null;
}

const KPI_ICONS: Record<string, string> = {
  TOTAL_CONVERSATIONS: 'forum',
  CONVERSATIONS_TODAY: 'today',
  OPEN_CONVERSATIONS: 'mark_chat_unread',
  PENDING_CONVERSATIONS: 'schedule',
  PENDING_MESSAGES: 'schedule',
  RESOLVED_CONVERSATIONS: 'task_alt',
  RESPONDED_MESSAGES: 'task_alt',
  ARCHIVED_CONVERSATIONS: 'archive',
  NEW_CLIENTS: 'person_add',
  FREQUENT_CLIENTS: 'diversity_3',
  TOTAL_CLIENTS: 'diversity_3',
  IMPORTANT_CONVERSATIONS: 'star',
  QUOTES: 'request_quote',
  RESERVATIONS: 'event_available',
  SALES: 'payments',
  HIGH_PRIORITY: 'priority_high',
  ACTIVE_CONVERSATIONS: 'bolt',
  AVG_RESPONSE_TIME: 'timer',
  AVG_RESPONSE_SECONDS: 'timer',
  MESSAGES_TODAY: 'chat',
  TOTAL_MESSAGES: 'chat_bubble',
  UNREAD_MESSAGES: 'mark_email_unread'
};

const KPI_ACCENTS: NonNullable<KpiItem['accent']>[] = ['forest', 'leaf', 'amber', 'mint', 'danger'];

function formatKpiValue(dto: KpiDto): string | number {
  if (dto.code === 'AVG_RESPONSE_SECONDS') {
    const total = Math.max(0, Math.round(dto.value));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return dto.value;
}

export function mapKpiDto(dto: KpiDto, index = 0): KpiItem {
  const delta = dto.changePercent ?? undefined;
  return {
    id: dto.code,
    label: dto.code === 'AVG_RESPONSE_SECONDS' ? 'Tiempo promedio de respuesta' : dto.label,
    value: formatKpiValue(dto),
    delta,
    trend: delta === undefined ? undefined : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    icon: KPI_ICONS[dto.code] ?? 'insights',
    accent: KPI_ACCENTS[index % KPI_ACCENTS.length]
  };
}
