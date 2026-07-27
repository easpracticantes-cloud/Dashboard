package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.report.ReportSummaryDto;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import com.escuelaaves.sig.domain.port.in.ReportUseCase;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportService implements ReportUseCase {

    private final ConversationRepositoryPort conversationRepositoryPort;
    private final ClientRepositoryPort clientRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;

    @Override
    public ReportSummaryDto getConversationsReport() {
        return new ReportSummaryDto(
                conversationRepositoryPort.count(),
                conversationRepositoryPort.countByStatus(ConversationStatus.OPEN),
                conversationRepositoryPort.countByStatus(ConversationStatus.RESOLVED),
                clientRepositoryPort.count(),
                messageRepositoryPort.count(),
                Instant.now()
        );
    }

    @Override
    public byte[] exportConversationsCsv() {
        ReportSummaryDto summary = getConversationsReport();
        StringBuilder csv = new StringBuilder();
        csv.append("metrica,valor\n");
        csv.append("total_conversaciones,").append(summary.totalConversations()).append('\n');
        csv.append("conversaciones_abiertas,").append(summary.openConversations()).append('\n');
        csv.append("conversaciones_resueltas,").append(summary.resolvedConversations()).append('\n');
        csv.append("total_clientes,").append(summary.totalClients()).append('\n');
        csv.append("total_mensajes,").append(summary.totalMessages()).append('\n');
        csv.append("generado_en,").append(DateTimeFormatter.ISO_INSTANT.format(summary.generatedAt())).append('\n');
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public byte[] exportConversationsPdf() {
        // Stub: se genera un documento de texto plano que simula el reporte
        // hasta integrar una libreria de generacion de PDF (p.ej. iText).
        ReportSummaryDto summary = getConversationsReport();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        String content = """
                REPORTE DE CONVERSACIONES - SIG Escuela Aves Salento
                ------------------------------------------------------
                Total de conversaciones: %d
                Conversaciones abiertas: %d
                Conversaciones resueltas: %d
                Total de clientes: %d
                Total de mensajes: %d
                Generado en: %s
                """.formatted(
                summary.totalConversations(),
                summary.openConversations(),
                summary.resolvedConversations(),
                summary.totalClients(),
                summary.totalMessages(),
                summary.generatedAt()
        );
        out.writeBytes(content.getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }
}
