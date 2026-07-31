package com.escuelaaves.sig.application.dto.ops;

import com.escuelaaves.sig.domain.model.ClientSegment;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import com.escuelaaves.sig.domain.model.NotificationType;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class OpsDtos {
    private OpsDtos() {
    }

    public record CountByKey(String key, long count) {
    }

    public record AmountByKey(String key, BigDecimal amount, long count) {
    }

    public record ClientTimelineItem(String type, String title, Instant at, UUID refId) {
    }

    public record AdvisorWorkload(UUID userId, String fullName, long openConversations, long unreadMessages, long salesCount) {
    }

    public record FunnelMetrics(long clients, long conversations, long quotes, long reservations, long sales,
                                double quoteToSaleRate) {
    }

    public record OperationalHealth(long clients, long openConversations, long pendingConversations,
                                    long unreadNotifications, long expiringQuotes, long upcomingReservations,
                                    double dataQualityScore) {
    }

    public record AuditEntry(UUID id, String action, String entityType, String entityId, String details, Instant createdAt) {
    }

    public record CreateNotificationRequest(UUID userId, String title, String body, NotificationType type, String link) {
    }

    public record AssignRequest(UUID userId) {
    }

    public record TagsRequest(Set<String> tags) {
    }

    public record BulkStatusRequest(List<UUID> ids, ConversationStatus status) {
    }

    public record NotesRequest(String notes) {
    }

    public record StatusRequest(CommercialStatus status) {
    }

    public record PaymentMethodRequest(String paymentMethod) {
    }

    public record FindOrCreateClientRequest(String phone, String name, ClientSegment segment) {
    }

    public record ConvertQuoteRequest(String experienceName, int partySize, LocalDate reservationDate, BigDecimal amount) {
    }

    public record SegmentCount(ClientSegment segment, long count) {
    }

    public record DailyVolume(LocalDate day, long conversations) {
    }

    public record TopClientSales(UUID clientId, String clientName, BigDecimal total, long sales) {
    }

    public record DataQualityReport(double score, long clientsTotal, long clientsWithPhone, long quotesWithAmount,
                                    long conversationsWithAssignee, Map<String, Object> details) {
    }

    /** Snapshot agregado del command center (una sola respuesta HTTP). */
    public record CommandCenterSnapshot(
            OperationalHealth health,
            FunnelMetrics funnel,
            List<com.escuelaaves.sig.application.dto.commercial.ReservationDto> agenda,
            List<com.escuelaaves.sig.application.dto.commercial.QuoteDto> expiringQuotes,
            long salesTodayCount,
            BigDecimal salesTodayAmount,
            double conversionPct,
            Map<String, Object> responseLag
    ) {
    }
}
