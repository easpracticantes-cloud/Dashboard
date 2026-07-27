export type IntegrationCode = 'WHATSAPP' | 'GOOGLE_SHEETS' | 'GOOGLE_DRIVE' | 'CLAUDE_AI' | 'N8N' | 'EMAIL' | 'ACCOUNTING';
export type IntegrationStatusValue = 'DISABLED' | 'READY' | 'CONNECTED' | 'ERROR';

/** Mirrors the backend `IntegrationStatusDto` record exactly. */
export interface IntegrationStatusDto {
  code: IntegrationCode;
  name: string;
  status: IntegrationStatusValue;
  description?: string | null;
}
