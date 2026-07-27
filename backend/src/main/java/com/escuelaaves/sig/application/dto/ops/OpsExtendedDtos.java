package com.escuelaaves.sig.application.dto.ops;

import com.escuelaaves.sig.domain.model.ClientSegment;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.MessageStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class OpsExtendedDtos {
    private OpsExtendedDtos() {
    }

    public record SegmentRequest(ClientSegment segment) {
    }

    public record BulkAssignClientsRequest(List<UUID> clientIds, UUID userId) {
    }

    public record BulkAssignConversationsRequest(List<UUID> conversationIds, UUID userId) {
    }

    public record PriorityRequest(ConversationPriority priority) {
    }

    public record ImportanceRequest(int importance) {
    }

    public record CategoryRequest(String category) {
    }

    public record MessageStatusRequest(MessageStatus status) {
    }

    public record NotesAppendRequest(String notes) {
    }

    public record ExtendValidityRequest(LocalDate validUntil) {
    }

    public record ConvertReservationToSaleRequest(String concept, BigDecimal amount, String paymentMethod) {
    }

    public record UpsertSettingRequest(String key, String value) {
    }

    public record RoleCount(String role, long count) {
    }

    public record SourceCount(String source, long count) {
    }

    public record MonthlyPoint(String month, long count, BigDecimal amount) {
    }

    public record MessageStats(long inbound, long outbound, long total) {
    }

    public record DuplicatePhone(String phone, long clients, List<UUID> clientIds) {
    }

    public record OperationalDigest(
            Map<String, Object> health,
            Map<String, Object> funnel,
            Map<String, Object> pipeline,
            List<String> alerts
    ) {
    }

    public record SettingUpsertResult(String key, String value) {
    }

    public record CloneQuoteResult(UUID sourceId, UUID newId, String newCode) {
    }

    public record IntegrationHealth(String code, String status, String description) {
    }
}
