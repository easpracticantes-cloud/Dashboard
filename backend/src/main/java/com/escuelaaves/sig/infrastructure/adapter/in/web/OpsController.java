package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.dto.notification.NotificationDto;
import com.escuelaaves.sig.application.dto.ops.OpsDtos;
import com.escuelaaves.sig.application.service.SigOpsService;
import com.escuelaaves.sig.domain.model.AuditAction;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/ops")
@RequiredArgsConstructor
@Tag(name = "Operaciones SIG", description = "50 funciones de optimización CRM / inbox / comercial / insights")
public class OpsController {

    private final SigOpsService ops;

    // —— CRM ——
    @GetMapping("/clients/search")
    @Operation(summary = "1. Buscar clientes por nombre/teléfono/email/tag")
    public List<ClientDto> searchClients(@RequestParam(defaultValue = "") String q) {
        return ops.searchClients(q);
    }

    @GetMapping("/clients/by-segment")
    @Operation(summary = "2. Contar clientes por segmento")
    public List<OpsDtos.SegmentCount> clientsBySegment() {
        return ops.countClientsBySegment();
    }

    @PostMapping("/clients/{id}/assign")
    @Operation(summary = "3. Asignar cliente a asesor")
    public ClientDto assignClient(@PathVariable UUID id, @RequestBody OpsDtos.AssignRequest body) {
        return ops.assignClient(id, body.userId());
    }

    @PostMapping("/clients/{id}/touch")
    @Operation(summary = "4. Actualizar último contacto")
    public ClientDto touchClient(@PathVariable UUID id) {
        return ops.touchLastContact(id);
    }

    @PostMapping("/clients/{id}/tags/add")
    @Operation(summary = "5. Añadir tags a cliente")
    public ClientDto addTags(@PathVariable UUID id, @RequestBody OpsDtos.TagsRequest body) {
        return ops.addClientTags(id, body.tags());
    }

    @PostMapping("/clients/{id}/tags/remove")
    @Operation(summary = "6. Quitar tags de cliente")
    public ClientDto removeTags(@PathVariable UUID id, @RequestBody OpsDtos.TagsRequest body) {
        return ops.removeClientTags(id, body.tags());
    }

    @PostMapping("/clients/find-or-create")
    @Operation(summary = "7. Buscar o crear cliente por teléfono")
    public ClientDto findOrCreate(@Valid @RequestBody OpsDtos.FindOrCreateClientRequest body) {
        return ops.findOrCreateClientByPhone(body.phone(), body.name(), body.segment());
    }

    @GetMapping("/clients/{id}/timeline")
    @Operation(summary = "8. Timeline del cliente (conv/cotiz/reservas/ventas)")
    public List<OpsDtos.ClientTimelineItem> timeline(@PathVariable UUID id) {
        return ops.getClientTimeline(id);
    }

    @GetMapping("/clients/unassigned")
    @Operation(summary = "9. Clientes sin asesor")
    public List<ClientDto> unassignedClients() {
        return ops.listClientsWithoutAssignee();
    }

    @GetMapping("/clients/export.csv")
    @Operation(summary = "10. Exportar clientes CSV")
    public ResponseEntity<byte[]> exportClients() {
        byte[] csv = ops.exportClientsCsv();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=clientes-sig.csv")
                .contentType(new MediaType("text", "csv"))
                .body(csv);
    }

    // —— Inbox ——
    @GetMapping("/inbox/unread-total")
    @Operation(summary = "11. Total de no leídos")
    public Map<String, Long> unreadTotal() {
        return Map.of("unread", ops.getUnreadTotal());
    }

    @GetMapping("/inbox/unread-by-advisor")
    @Operation(summary = "12. No leídos por asesor")
    public List<OpsDtos.CountByKey> unreadByAdvisor() {
        return ops.getUnreadByAdvisor();
    }

    @PostMapping("/inbox/{id}/read")
    @Operation(summary = "13. Marcar conversación leída")
    public ResponseEntity<Void> markRead(@PathVariable UUID id) {
        ops.markConversationRead(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/inbox/{id}/unread")
    @Operation(summary = "14. Marcar conversación no leída")
    public ResponseEntity<Void> markUnread(@PathVariable UUID id) {
        ops.markConversationUnread(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/inbox/bulk-status")
    @Operation(summary = "15. Cambio masivo de estado")
    public Map<String, Integer> bulkStatus(@RequestBody OpsDtos.BulkStatusRequest body) {
        return Map.of("updated", ops.bulkUpdateConversationStatus(body.ids(), body.status()));
    }

    @PostMapping("/inbox/{id}/transfer")
    @Operation(summary = "16. Transferir conversación")
    public ResponseEntity<Void> transfer(@PathVariable UUID id, @RequestBody OpsDtos.AssignRequest body) {
        ops.transferConversation(id, body.userId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/inbox/{id}/labels/add")
    @Operation(summary = "17. Añadir etiquetas")
    public ResponseEntity<Void> addLabels(@PathVariable UUID id, @RequestBody OpsDtos.TagsRequest body) {
        ops.addConversationLabels(id, body.tags());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/inbox/{id}/labels/remove")
    @Operation(summary = "18. Quitar etiquetas")
    public ResponseEntity<Void> removeLabels(@PathVariable UUID id, @RequestBody OpsDtos.TagsRequest body) {
        ops.removeConversationLabels(id, body.tags());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/inbox/stale")
    @Operation(summary = "19. Conversaciones abiertas estancadas")
    public List<UUID> stale(@RequestParam(defaultValue = "7") int days) {
        return ops.listStaleOpenConversations(days);
    }

    @PostMapping("/inbox/{id}/close")
    @Operation(summary = "20. Cerrar con notas")
    public ResponseEntity<Void> close(@PathVariable UUID id, @RequestBody(required = false) OpsDtos.NotesRequest body) {
        ops.closeConversationWithNotes(id, body != null ? body.notes() : null);
        return ResponseEntity.noContent().build();
    }

    // —— Comercial ——
    @GetMapping("/quotes/{id}")
    @Operation(summary = "21. Obtener cotización")
    public QuoteDto getQuote(@PathVariable UUID id) {
        return ops.getQuote(id);
    }

    @PatchMapping("/quotes/{id}/status")
    @Operation(summary = "22. Cambiar estado de cotización")
    public QuoteDto quoteStatus(@PathVariable UUID id, @RequestBody OpsDtos.StatusRequest body) {
        return ops.changeQuoteStatus(id, body.status());
    }

    @GetMapping("/quotes/by-client/{clientId}")
    @Operation(summary = "23. Cotizaciones por cliente")
    public List<QuoteDto> quotesByClient(@PathVariable UUID clientId) {
        return ops.listQuotesByClient(clientId);
    }

    @GetMapping("/quotes/expiring")
    @Operation(summary = "24. Cotizaciones por vencer")
    public List<QuoteDto> expiring(@RequestParam(defaultValue = "7") int days) {
        return ops.listExpiringQuotes(days);
    }

    @PostMapping("/quotes/{id}/convert-reservation")
    @Operation(summary = "25. Convertir cotización → reserva")
    public ReservationDto convert(@PathVariable UUID id, @RequestBody(required = false) OpsDtos.ConvertQuoteRequest body) {
        return ops.convertQuoteToReservation(id, body);
    }

    @GetMapping("/commercial/pipeline")
    @Operation(summary = "26. Resumen pipeline comercial")
    public Map<String, Long> pipeline() {
        return ops.getCommercialPipelineSummary();
    }

    @GetMapping("/quotes/amounts-by-status")
    @Operation(summary = "27. Montos de cotizaciones por estado")
    public List<OpsDtos.AmountByKey> quoteAmounts() {
        return ops.sumQuotesAmountByStatus();
    }

    @GetMapping("/sales/period")
    @Operation(summary = "28. Ventas por periodo")
    public List<Map<String, Object>> salesPeriod(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ops.listSalesByPeriod(from, to);
    }

    @GetMapping("/sales/sum")
    @Operation(summary = "29. Suma de ventas del periodo")
    public Map<String, Object> salesSum(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return Map.of("total", ops.sumSalesAmount(from, to));
    }

    @PatchMapping("/sales/{id}/payment-method")
    @Operation(summary = "30. Actualizar método de pago")
    public ResponseEntity<Void> paymentMethod(@PathVariable UUID id, @RequestBody OpsDtos.PaymentMethodRequest body) {
        ops.updateSalePaymentMethod(id, body.paymentMethod());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/reservations/upcoming")
    @Operation(summary = "31. Reservas próximas")
    public List<ReservationDto> upcoming(@RequestParam(defaultValue = "14") int days) {
        return ops.listReservationsUpcoming(days);
    }

    @PostMapping("/reservations/{id}/cancel")
    @Operation(summary = "32. Cancelar reserva")
    public ReservationDto cancelReservation(@PathVariable UUID id, @RequestBody(required = false) OpsDtos.NotesRequest body) {
        return ops.cancelReservation(id, body != null ? body.notes() : null);
    }

    // —— Insights ——
    @GetMapping("/insights/health")
    @Operation(summary = "33. Salud operativa")
    public OpsDtos.OperationalHealth health() {
        return ops.getOperationalHealth();
    }

    @GetMapping("/insights/funnel")
    @Operation(summary = "34. Métricas de embudo")
    public OpsDtos.FunnelMetrics funnel() {
        return ops.getFunnelMetrics();
    }

    @GetMapping("/insights/advisor-workload")
    @Operation(summary = "35. Carga por asesor")
    public List<OpsDtos.AdvisorWorkload> workload() {
        return ops.getAdvisorWorkload();
    }

    @GetMapping("/insights/channels")
    @Operation(summary = "36. Desglose por canal")
    public List<OpsDtos.CountByKey> channels() {
        return ops.getChannelBreakdown();
    }

    @GetMapping("/insights/priorities")
    @Operation(summary = "37. Distribución de prioridades")
    public List<OpsDtos.CountByKey> priorities() {
        return ops.getPriorityDistribution();
    }

    @GetMapping("/insights/daily-volume")
    @Operation(summary = "38. Volumen diario de conversaciones")
    public List<OpsDtos.DailyVolume> dailyVolume(@RequestParam(defaultValue = "30") int days) {
        return ops.getDailyConversationVolume(days);
    }

    @GetMapping("/insights/top-clients")
    @Operation(summary = "39. Top clientes por ventas")
    public List<OpsDtos.TopClientSales> topClients(@RequestParam(defaultValue = "10") int limit) {
        return ops.getTopClientsBySales(limit);
    }

    @GetMapping("/insights/conversion-quote-sale")
    @Operation(summary = "40. Tasa conversión cotización→venta")
    public Map<String, Double> conversion() {
        return Map.of("ratePct", ops.getConversionRateQuoteToSale());
    }

    @GetMapping("/insights/response-lag")
    @Operation(summary = "41. Proxy de lag de respuesta")
    public Map<String, Object> responseLag() {
        return ops.getAverageResponseLagHint();
    }

    @GetMapping("/insights/data-quality")
    @Operation(summary = "42. Score de calidad de datos")
    public OpsDtos.DataQualityReport dataQuality() {
        return ops.getDataQualityScore();
    }

    // —— Notificaciones / auditoría / usuarios ——
    @PostMapping("/notifications")
    @Operation(summary = "43. Crear notificación")
    public NotificationDto createNotification(@RequestBody OpsDtos.CreateNotificationRequest body) {
        return ops.createNotification(body);
    }

    @PostMapping("/notifications/mark-all-read")
    @Operation(summary = "44. Marcar todas como leídas")
    public Map<String, Integer> markAllRead() {
        return Map.of("updated", ops.markAllNotificationsRead());
    }

    @GetMapping("/notifications/unread-count")
    @Operation(summary = "45. Contar no leídas")
    public Map<String, Long> unreadNotifCount() {
        return Map.of("unread", ops.countUnreadNotifications());
    }

    @PostMapping("/notifications/conversation-assigned/{conversationId}")
    @Operation(summary = "46. Notificar asignación de conversación")
    public ResponseEntity<Void> notifyAssigned(@PathVariable UUID conversationId) {
        ops.notifyConversationAssigned(conversationId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/notifications/quotes-expiring")
    @Operation(summary = "47. Alertar cotizaciones por vencer")
    public Map<String, Integer> notifyExpiring() {
        return Map.of("created", ops.notifyQuoteExpiringSoon());
    }

    @PostMapping("/audit")
    @Operation(summary = "48. Registrar auditoría")
    public OpsDtos.AuditEntry audit(
            @RequestParam AuditAction action,
            @RequestParam String entityType,
            @RequestParam String entityId,
            @RequestParam(required = false) String details) {
        return ops.recordAuditEntry(action, entityType, entityId, details);
    }

    @GetMapping("/audit/recent")
    @Operation(summary = "49. Auditoría reciente")
    public List<OpsDtos.AuditEntry> recentAudit(@RequestParam(defaultValue = "30") int limit) {
        return ops.listRecentAudit(limit);
    }

    @PatchMapping("/users/{id}/active")
    @Operation(summary = "50. Activar/desactivar usuario")
    public Map<String, Object> setActive(@PathVariable UUID id, @RequestParam boolean active) {
        return ops.setUserActive(id, active);
    }
}
