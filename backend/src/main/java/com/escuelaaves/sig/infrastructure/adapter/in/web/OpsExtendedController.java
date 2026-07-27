package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.dto.commercial.SaleDto;
import com.escuelaaves.sig.application.dto.conversation.ConversationDto;
import com.escuelaaves.sig.application.dto.conversation.MessageDto;
import com.escuelaaves.sig.application.dto.ops.OpsDtos;
import com.escuelaaves.sig.application.dto.ops.OpsExtendedDtos;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.application.service.SigOpsExtendedService;
import com.escuelaaves.sig.domain.model.ClientSegment;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/ops")
@RequiredArgsConstructor
@Tag(name = "Operaciones SIG Ext", description = "70 funciones adicionales (51–120) CRM / inbox / comercial / calidad / reportes")
public class OpsExtendedController {

    private final SigOpsExtendedService ops;

    // —— 51–62 CRM ——
    @GetMapping("/clients/by-source")
    @Operation(summary = "51. Listar clientes por fuente")
    public List<ClientDto> clientsBySource(@RequestParam(defaultValue = "") String source) {
        return ops.listClientsBySource(source);
    }

    @PatchMapping("/clients/{id}/segment")
    @Operation(summary = "52. Actualizar segmento de cliente")
    public ClientDto updateSegment(@PathVariable UUID id, @RequestBody OpsExtendedDtos.SegmentRequest body) {
        return ops.updateClientSegment(id, body.segment());
    }

    @GetMapping("/clients/vip")
    @Operation(summary = "53. Listar clientes VIP")
    public List<ClientDto> vipClients() {
        return ops.listVipClients();
    }

    @GetMapping("/clients/inactive")
    @Operation(summary = "54. Listar clientes inactivos")
    public List<ClientDto> inactiveClients() {
        return ops.listInactiveClients();
    }

    @PostMapping("/clients/bulk-assign")
    @Operation(summary = "55. Reasignar clientes en lote")
    public Map<String, Integer> bulkAssignClients(@RequestBody OpsExtendedDtos.BulkAssignClientsRequest body) {
        return Map.of("updated", ops.reassignClientsBulk(body.clientIds(), body.userId()));
    }

    @GetMapping("/clients/count-by-source")
    @Operation(summary = "56. Contar clientes por fuente")
    public List<OpsExtendedDtos.SourceCount> countBySource() {
        return ops.countClientsBySource();
    }

    @PostMapping("/clients/{id}/notes/append")
    @Operation(summary = "57. Anexar notas a cliente")
    public ClientDto mergeNotes(@PathVariable UUID id, @RequestBody OpsExtendedDtos.NotesAppendRequest body) {
        return ops.mergeClientNotes(id, body.notes());
    }

    @GetMapping("/clients/contacted-since")
    @Operation(summary = "58. Clientes contactados en N días")
    public List<ClientDto> contactedSince(@RequestParam(defaultValue = "30") int days) {
        return ops.listClientsContactedSince(days);
    }

    @GetMapping("/clients/never-contacted")
    @Operation(summary = "59. Clientes sin contacto")
    public List<ClientDto> neverContacted() {
        return ops.listClientsNeverContacted();
    }

    @GetMapping("/clients/{id}/suggest-segment")
    @Operation(summary = "60. Sugerir segmento heurístico")
    public Map<String, ClientSegment> suggestSegment(@PathVariable UUID id) {
        return Map.of("segment", ops.suggestSegmentForClient(id));
    }

    @GetMapping("/clients/export-by-segment.csv")
    @Operation(summary = "61. Exportar clientes por segmento CSV")
    public ResponseEntity<byte[]> exportBySegment(@RequestParam(required = false) ClientSegment segment) {
        return csv("clients-segment.csv", ops.exportClientsBySegmentCsv(segment));
    }

    @GetMapping("/clients/duplicate-phones")
    @Operation(summary = "62. Detectar teléfonos duplicados")
    public List<OpsExtendedDtos.DuplicatePhone> duplicatePhones() {
        return ops.duplicatePhoneCheck();
    }

    // —— 63–80 Inbox ——
    @GetMapping("/inbox/mine")
    @Operation(summary = "63. Mi bandeja (asignadas abiertas/pendientes)")
    public List<ConversationDto> myInbox() {
        return ops.listMyInbox();
    }

    @GetMapping("/inbox/unassigned")
    @Operation(summary = "64. Conversaciones sin asignar")
    public List<ConversationDto> unassignedInbox() {
        return ops.listUnassignedConversations();
    }

    @PatchMapping("/inbox/{id}/priority")
    @Operation(summary = "65. Cambiar prioridad")
    public ConversationDto setPriority(@PathVariable UUID id, @RequestBody OpsExtendedDtos.PriorityRequest body) {
        return ops.setConversationPriority(id, body.priority());
    }

    @PatchMapping("/inbox/{id}/importance")
    @Operation(summary = "66. Cambiar importancia 1–5")
    public ConversationDto setImportance(@PathVariable UUID id, @RequestBody OpsExtendedDtos.ImportanceRequest body) {
        return ops.setConversationImportance(id, body.importance());
    }

    @PatchMapping("/inbox/{id}/category")
    @Operation(summary = "67. Cambiar categoría")
    public ConversationDto setCategory(@PathVariable UUID id, @RequestBody OpsExtendedDtos.CategoryRequest body) {
        return ops.setConversationCategory(id, body.category());
    }

    @PostMapping("/inbox/{id}/archive")
    @Operation(summary = "68. Archivar conversación")
    public ConversationDto archive(@PathVariable UUID id) {
        return ops.archiveConversation(id);
    }

    @PostMapping("/inbox/{id}/reopen")
    @Operation(summary = "69. Reabrir conversación")
    public ConversationDto reopen(@PathVariable UUID id) {
        return ops.reopenConversation(id);
    }

    @GetMapping("/inbox/count-by-status")
    @Operation(summary = "70. Conteo por estado")
    public List<OpsDtos.CountByKey> countByStatus() {
        return ops.countConversationsByStatus();
    }

    @GetMapping("/inbox/count-by-priority")
    @Operation(summary = "71. Conteo por prioridad")
    public List<OpsDtos.CountByKey> countByPriority() {
        return ops.countConversationsByPriority();
    }

    @GetMapping("/inbox/high-priority")
    @Operation(summary = "72. Abiertas de alta prioridad")
    public List<ConversationDto> highPriority() {
        return ops.listHighPriorityOpen();
    }

    @GetMapping("/inbox/search")
    @Operation(summary = "73. Buscar conversaciones")
    public List<ConversationDto> searchInbox(@RequestParam String q) {
        return ops.searchConversations(q);
    }

    @GetMapping("/inbox/{id}/message-count")
    @Operation(summary = "74. Contar mensajes de conversación")
    public Map<String, Long> messageCount(@PathVariable UUID id) {
        return Map.of("count", ops.getConversationMessageCount(id));
    }

    @GetMapping("/messages/recent")
    @Operation(summary = "75. Mensajes recientes")
    public List<MessageDto> recentMessages(@RequestParam(defaultValue = "50") int limit) {
        return ops.listRecentMessages(limit);
    }

    @PatchMapping("/messages/{id}/status")
    @Operation(summary = "76. Actualizar estado de mensaje")
    public MessageDto updateMessageStatus(@PathVariable UUID id, @RequestBody OpsExtendedDtos.MessageStatusRequest body) {
        return ops.updateMessageStatus(id, body.status());
    }

    @GetMapping("/messages/inbound-outbound")
    @Operation(summary = "77. Stats inbound/outbound")
    public OpsExtendedDtos.MessageStats inboundOutbound() {
        return ops.countInboundOutbound();
    }

    @GetMapping("/inbox/without-messages")
    @Operation(summary = "78. Conversaciones sin mensajes")
    public List<ConversationDto> withoutMessages() {
        return ops.listConversationsWithoutMessages();
    }

    @PostMapping("/inbox/{id}/notes/append")
    @Operation(summary = "79. Anexar nota a conversación")
    public ConversationDto pinNote(@PathVariable UUID id, @RequestBody OpsExtendedDtos.NotesAppendRequest body) {
        return ops.pinNoteOnConversation(id, body.notes());
    }

    @PostMapping("/inbox/bulk-assign")
    @Operation(summary = "80. Asignar conversaciones en lote")
    public Map<String, Integer> bulkAssignInbox(@RequestBody OpsExtendedDtos.BulkAssignConversationsRequest body) {
        return Map.of("updated", ops.bulkAssignConversations(body.conversationIds(), body.userId()));
    }

    // —— 81–100 Comercial ——
    @GetMapping("/reservations/{id}")
    @Operation(summary = "81. Obtener reserva")
    public ReservationDto getReservation(@PathVariable UUID id) {
        return ops.getReservation(id);
    }

    @GetMapping("/sales/{id}")
    @Operation(summary = "82. Obtener venta")
    public SaleDto getSale(@PathVariable UUID id) {
        return ops.getSale(id);
    }

    @PatchMapping("/reservations/{id}/status")
    @Operation(summary = "83. Cambiar estado de reserva")
    public ReservationDto reservationStatus(@PathVariable UUID id, @RequestBody OpsDtos.StatusRequest body) {
        return ops.changeReservationStatus(id, body.status());
    }

    @PatchMapping("/sales/{id}/status")
    @Operation(summary = "84. Cambiar estado de venta")
    public SaleDto saleStatus(@PathVariable UUID id, @RequestBody OpsDtos.StatusRequest body) {
        return ops.changeSaleStatus(id, body.status());
    }

    @PostMapping("/reservations/{id}/convert-sale")
    @Operation(summary = "85. Convertir reserva a venta")
    public SaleDto convertReservation(
            @PathVariable UUID id,
            @RequestBody(required = false) OpsExtendedDtos.ConvertReservationToSaleRequest body) {
        return ops.convertReservationToSale(id, body);
    }

    @GetMapping("/quotes/by-advisor/{advisorId}")
    @Operation(summary = "86. Cotizaciones por asesor")
    public List<QuoteDto> quotesByAdvisor(@PathVariable UUID advisorId) {
        return ops.listQuotesByAdvisor(advisorId);
    }

    @GetMapping("/sales/by-advisor/{advisorId}")
    @Operation(summary = "87. Ventas por asesor")
    public List<SaleDto> salesByAdvisor(@PathVariable UUID advisorId) {
        return ops.listSalesByAdvisor(advisorId);
    }

    @GetMapping("/reservations/by-client/{clientId}")
    @Operation(summary = "88. Reservas por cliente")
    public List<ReservationDto> reservationsByClient(@PathVariable UUID clientId) {
        return ops.listReservationsByClient(clientId);
    }

    @GetMapping("/sales/by-client/{clientId}")
    @Operation(summary = "89. Ventas por cliente")
    public List<SaleDto> salesByClient(@PathVariable UUID clientId) {
        return ops.listSalesByClient(clientId);
    }

    @GetMapping("/sales/average-amount")
    @Operation(summary = "90. Ticket promedio de venta")
    public Map<String, BigDecimal> avgSale() {
        return Map.of("average", ops.averageSaleAmount());
    }

    @GetMapping("/quotes/average-amount")
    @Operation(summary = "91. Monto promedio de cotización")
    public Map<String, BigDecimal> avgQuote() {
        return Map.of("average", ops.averageQuoteAmount());
    }

    @GetMapping("/quotes/zero-amount")
    @Operation(summary = "92. Cotizaciones en cero")
    public List<QuoteDto> zeroQuotes() {
        return ops.listZeroAmountQuotes();
    }

    @GetMapping("/reservations/confirmed-today")
    @Operation(summary = "93. Reservas confirmadas hoy")
    public List<ReservationDto> confirmedToday() {
        return ops.listConfirmedReservationsToday();
    }

    @GetMapping("/sales/monthly-series")
    @Operation(summary = "94. Serie mensual de ventas")
    public List<OpsExtendedDtos.MonthlyPoint> salesMonthly(@RequestParam(defaultValue = "6") int months) {
        return ops.monthlySalesSeries(months);
    }

    @GetMapping("/quotes/monthly-series")
    @Operation(summary = "95. Serie mensual de cotizaciones")
    public List<OpsExtendedDtos.MonthlyPoint> quotesMonthly(@RequestParam(defaultValue = "6") int months) {
        return ops.monthlyQuotesSeries(months);
    }

    @GetMapping("/sales/by-payment-method")
    @Operation(summary = "96. Ingresos por método de pago")
    public List<OpsDtos.AmountByKey> byPaymentMethod() {
        return ops.revenueByPaymentMethod();
    }

    @PostMapping("/quotes/{id}/clone")
    @Operation(summary = "97. Duplicar cotización")
    public OpsExtendedDtos.CloneQuoteResult cloneQuote(@PathVariable UUID id) {
        return ops.duplicateQuote(id);
    }

    @PatchMapping("/quotes/{id}/extend-validity")
    @Operation(summary = "98. Extender vigencia de cotización")
    public QuoteDto extendValidity(@PathVariable UUID id, @RequestBody OpsExtendedDtos.ExtendValidityRequest body) {
        return ops.extendQuoteValidity(id, body.validUntil());
    }

    @GetMapping("/reservations/overdue")
    @Operation(summary = "99. Reservas vencidas sin cerrar")
    public List<ReservationDto> overdueReservations() {
        return ops.listOverdueReservations();
    }

    @GetMapping("/commercial/digest")
    @Operation(summary = "100. Digest comercial")
    public Map<String, Object> commercialDigest() {
        return ops.commercialDigest();
    }

    // —— 101–110 Calidad ——
    @GetMapping("/quality/conversations-missing-key")
    @Operation(summary = "101. Conversaciones sin externalKey")
    public Map<String, Long> missingKey() {
        return Map.of("count", ops.conversationsMissingExternalKey());
    }

    @GetMapping("/quality/clients-missing-email")
    @Operation(summary = "102. Clientes sin email")
    public Map<String, Long> missingEmail() {
        return Map.of("count", ops.clientsMissingEmail());
    }

    @GetMapping("/quality/quotes-missing-advisor")
    @Operation(summary = "103. Cotizaciones sin asesor")
    public Map<String, Long> quotesNoAdvisor() {
        return Map.of("count", ops.quotesMissingAdvisor());
    }

    @GetMapping("/quality/reservations-missing-quote")
    @Operation(summary = "104. Reservas sin cotización")
    public Map<String, Long> reservationsNoQuote() {
        return Map.of("count", ops.reservationsMissingQuoteLink());
    }

    @GetMapping("/quality/sales-missing-reservation")
    @Operation(summary = "105. Ventas sin reserva")
    public Map<String, Long> salesNoReservation() {
        return Map.of("count", ops.salesMissingReservationLink());
    }

    @GetMapping("/quality/orphan-accepted-quotes")
    @Operation(summary = "106. Cotizaciones aceptadas sin reserva")
    public Map<String, Long> orphanQuotes() {
        return Map.of("count", ops.orphanQuotesHint());
    }

    @GetMapping("/quality/sync-readiness")
    @Operation(summary = "107. Score de readiness Sheets/sync")
    public Map<String, Object> syncReadiness() {
        return ops.syncReadinessScore();
    }

    @GetMapping("/quality/duplicate-phones")
    @Operation(summary = "108. Duplicados de teléfono (calidad)")
    public List<OpsExtendedDtos.DuplicatePhone> qualityDupPhones() {
        return ops.listDuplicateClientPhones();
    }

    @GetMapping("/inbox/by-category")
    @Operation(summary = "109. Conversaciones por categoría")
    public List<OpsDtos.CountByKey> byCategory() {
        return ops.conversationsByCategory();
    }

    @GetMapping("/inbox/top-categories")
    @Operation(summary = "110. Top categorías")
    public List<OpsDtos.CountByKey> topCategories(@RequestParam(defaultValue = "10") int limit) {
        return ops.topCategories(limit);
    }

    // —— 111–120 Reportes / usuarios / integraciones ——
    @GetMapping("/export/quotes.csv")
    @Operation(summary = "111. Exportar cotizaciones CSV")
    public ResponseEntity<byte[]> exportQuotes() {
        return csv("quotes.csv", ops.exportQuotesCsv());
    }

    @GetMapping("/export/sales.csv")
    @Operation(summary = "112. Exportar ventas CSV")
    public ResponseEntity<byte[]> exportSales() {
        return csv("sales.csv", ops.exportSalesCsv());
    }

    @GetMapping("/export/reservations.csv")
    @Operation(summary = "113. Exportar reservas CSV")
    public ResponseEntity<byte[]> exportReservations() {
        return csv("reservations.csv", ops.exportReservationsCsv());
    }

    @GetMapping("/export/advisor-performance.csv")
    @Operation(summary = "114. Exportar desempeño asesores CSV")
    public ResponseEntity<byte[]> exportAdvisors() {
        return csv("advisor-performance.csv", ops.exportAdvisorPerformanceCsv());
    }

    @GetMapping("/users/active")
    @Operation(summary = "115. Usuarios activos")
    public List<UserDto> activeUsers() {
        return ops.listActiveUsers();
    }

    @GetMapping("/users/inactive")
    @Operation(summary = "116. Usuarios inactivos")
    public List<UserDto> inactiveUsers() {
        return ops.listInactiveUsers();
    }

    @GetMapping("/users/count-by-role")
    @Operation(summary = "117. Contar usuarios por rol")
    public List<OpsExtendedDtos.RoleCount> usersByRole() {
        return ops.countUsersByRole();
    }

    @GetMapping("/integrations/health")
    @Operation(summary = "118. Salud de integraciones")
    public List<OpsExtendedDtos.IntegrationHealth> integrationHealth() {
        return ops.getIntegrationHealthSummary();
    }

    @PutMapping("/settings/upsert")
    @Operation(summary = "119. Upsert de setting")
    public OpsExtendedDtos.SettingUpsertResult upsertSetting(@RequestBody OpsExtendedDtos.UpsertSettingRequest body) {
        return ops.upsertSetting(body.key(), body.value());
    }

    @GetMapping("/digest/operational")
    @Operation(summary = "120. Digest operativo del día")
    public OpsExtendedDtos.OperationalDigest operationalDigest() {
        return ops.getOperationalDigest();
    }

    private ResponseEntity<byte[]> csv(String filename, byte[] body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(body);
    }
}
