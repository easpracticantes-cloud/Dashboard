package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.integration.IntegrationStatusDto;
import com.escuelaaves.sig.domain.port.out.integration.IntegrationPort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Recolecta el estado de todos los puertos de integracion externa
 * registrados en el contexto de Spring (WhatsApp, Google Sheets, Google
 * Drive, Claude AI, n8n, Email y Contabilidad).
 */
@Service
@RequiredArgsConstructor
public class IntegrationStatusService {

    private static final Map<String, String> DESCRIPTIONS = Map.of(
            "WHATSAPP", "Canal principal de mensajeria con clientes",
            "GOOGLE_SHEETS", "Exportacion de datos operativos a hojas de calculo",
            "GOOGLE_DRIVE", "Almacenamiento de documentos y adjuntos",
            "CLAUDE_AI", "Asistente de IA para sugerencias y analisis",
            "GEMINI_AI", "Google Gemini — chat, cotizaciones e interpretacion",
            "N8N", "Automatizacion de flujos de trabajo",
            "EMAIL", "Notificaciones y recuperacion de contrasena por correo",
            "ACCOUNTING", "Sincronizacion con el sistema contable"
    );

    private final List<IntegrationPort> integrationPorts;

    public List<IntegrationStatusDto> getStatuses() {
        return integrationPorts.stream()
                .map(port -> new IntegrationStatusDto(
                        port.code(),
                        port.code().name(),
                        port.status(),
                        DESCRIPTIONS.getOrDefault(port.code().name(), "")
                ))
                .toList();
    }
}
