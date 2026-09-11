package com.escuelaaves.sig.domain.ai.model;

import java.util.List;
import java.util.Map;

/**
 * Extracción estructurada de un chat de WhatsApp hacia las columnas del Excel de Registro.
 */
public record SeguimientoExtraction(
        Map<String, FieldValue> campos,
        UltimaCotizacion ultimaCotizacion,
        List<UltimaCotizacion> historialCotizaciones,
        String posibleDuplicado,
        String resumen,
        DiscProfile discAnalisis
) {
    public SeguimientoExtraction {
        discAnalisis = discAnalisis == null ? DiscProfile.undetermined() : discAnalisis;
    }

    public SeguimientoExtraction(
            Map<String, FieldValue> campos,
            UltimaCotizacion ultimaCotizacion,
            List<UltimaCotizacion> historialCotizaciones,
            String posibleDuplicado,
            String resumen
    ) {
        this(campos, ultimaCotizacion, historialCotizaciones, posibleDuplicado, resumen, DiscProfile.undetermined());
    }

    public SeguimientoExtraction withDisc(DiscProfile profile) {
        DiscProfile disc = profile == null ? DiscProfile.undetermined() : profile;
        java.util.LinkedHashMap<String, FieldValue> next = new java.util.LinkedHashMap<>();
        if (campos != null) {
            next.putAll(campos);
        }
        if (disc.determined()) {
            next.put("disc", FieldValue.of(disc.disc(), "INFERIDO", disc.confidence()));
        } else {
            next.put("disc", FieldValue.of(null, "NO_ENCONTRADO", disc.confidence()));
        }
        return new SeguimientoExtraction(
                next, ultimaCotizacion, historialCotizaciones, posibleDuplicado, resumen, disc
        );
    }
    public record FieldValue(String valor, String estado, double confianza) {
        public static FieldValue of(String valor, String estado, double confianza) {
            return new FieldValue(valor, estado == null ? "NO_ENCONTRADO" : estado, confianza);
        }
    }

    public record UltimaCotizacion(
            String fecha,
            String servicio,
            String valor,
            String estado,
            String condiciones,
            String respuestaCliente
    ) {
    }

    public String valor(String campo) {
        FieldValue fv = campos == null ? null : campos.get(campo);
        return fv == null ? null : fv.valor();
    }
}
