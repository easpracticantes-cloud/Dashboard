package com.escuelaaves.sig.application.dto.dashboard;

import com.escuelaaves.sig.application.dto.conversation.ConversationDto;

import java.util.List;

public record DashboardOverviewDto(
        List<KpiDto> kpis,
        List<ConversationDto> recentConversations
) {
}
