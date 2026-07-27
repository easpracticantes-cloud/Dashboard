package com.escuelaaves.sig.application.dto.report;

import java.time.Instant;

public record ReportSummaryDto(
        long totalConversations,
        long openConversations,
        long resolvedConversations,
        long totalClients,
        long totalMessages,
        Instant generatedAt
) {
}
