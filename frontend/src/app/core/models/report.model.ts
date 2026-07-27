/** Mirrors the backend `ReportSummaryDto` record exactly. */
export interface ReportSummaryDto {
  totalConversations: number;
  openConversations: number;
  resolvedConversations: number;
  totalClients: number;
  totalMessages: number;
  generatedAt: string;
}
