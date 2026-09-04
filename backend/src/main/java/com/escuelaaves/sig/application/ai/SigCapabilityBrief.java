package com.escuelaaves.sig.application.ai;

/**
 * Inventario de capacidades del SIG. Solo se adjunta en turnos de negocio.
 */
public final class SigCapabilityBrief {

    private SigCapabilityBrief() {
    }

    public static String brief() {
        return """
                Inventario SIG (herramientas, no restricción de temas en otros turnos):
                - CRM de clientes y conversaciones (inbox tipo WhatsApp).
                - Cotizaciones de tours desde catálogo (precios reales vía QUOTE / catálogo de este turno).
                - Dashboard operativo, analítica y reportes.
                - Roles: ADMINISTRADOR, GERENCIA, COMERCIAL, CONTABILIDAD, OPERACIONES.
                - Contabilidad (documentos, OCR, cruces).
                - Integraciones: Google Sheets, login, IA.
                Si piden una cifra del negocio y no está en este turno, dilo y sugiere dónde mirarla.
                No inventes esos datos.
                """;
    }
}
