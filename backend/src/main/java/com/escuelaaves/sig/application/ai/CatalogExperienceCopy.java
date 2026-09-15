package com.escuelaaves.sig.application.ai;

import java.util.Locale;

/**
 * Textos comerciales por defecto cuando el JSON del catálogo no trae incluye/no incluye.
 * No inventa precios: solo copy operativo de Escuela Aves.
 */
public final class CatalogExperienceCopy {

    private CatalogExperienceCopy() {
    }

    public static String includesFor(String code, String name, String catalogIncludes) {
        if (notBlank(catalogIncludes)) {
            return catalogIncludes.trim();
        }
        String key = normalize(code + " " + name);
        if (containsAny(key, "parapente")) {
            return "Transporte desde casco urbano cercano, 4x4 a pista, vuelo, póliza, material audiovisual y piloto certificado.";
        }
        if (containsAny(key, "paramotor")) {
            return "Transporte casco urbano, vuelo, póliza, material audiovisual y piloto certificado.";
        }
        if (containsAny(key, "santuario", "palma")) {
            return "Traslado Willys, guianza, entradas, hidratación, snack, almuerzo típico, bastones, carpa lluvia y seguro.";
        }
        if (containsAny(key, "pijao")) {
            return "Jeep Willys, almuerzo, guía bilingüe, bebida, dulces, filtrados y póliza.";
        }
        if (containsAny(key, "aves", "bird", "gallito", "acaime", "cocora", "cafe", "salento", "kirakai", "ruta")) {
            return "Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.";
        }
        if (containsAny(key, "rafting", "canopy", "cabalgata", "bicirriel", "parapente", "globo")) {
            return "Operación con proveedor aliado, logística básica del tour y acompañamiento Escuela Aves.";
        }
        return "Guía / acompañamiento Escuela Aves y logística básica según el paquete seleccionado.";
    }

    public static String excludesFor(String code, String name, String catalogExcludes) {
        if (notBlank(catalogExcludes)) {
            return catalogExcludes.trim();
        }
        String key = normalize(code + " " + name);
        if (containsAny(key, "parapente", "paramotor", "globo")) {
            return "Propinas, consumos personales y servicios no descritos en el paquete.";
        }
        if (containsAny(key, "santuario", "pijao")) {
            return "Souvenirs, consumos extras y servicios no listados.";
        }
        return "Almuerzo (salvo que el paquete lo indique), propinas, souvenirs y traslados fuera del itinerario.";
    }

    public static String lineDescription(String name, String modality, int people, String includes) {
        StringBuilder sb = new StringBuilder();
        sb.append(notBlank(name) ? name.trim() : "Experiencia Escuela Aves");
        sb.append('\n');
        sb.append("Modalidad ").append(notBlank(modality) ? modality.toLowerCase(Locale.ROOT) : "privado");
        sb.append(" · ").append(people).append(people == 1 ? " persona" : " personas");
        sb.append(" · Tarifa catálogo EAS");
        if (notBlank(includes)) {
            String shortInc = includes.trim();
            if (shortInc.length() > 140) {
                shortInc = shortInc.substring(0, 137) + "…";
            }
            sb.append('\n').append("Incluye: ").append(shortInc);
        }
        return sb.toString();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static boolean containsAny(String haystack, String... needles) {
        for (String n : needles) {
            if (haystack.contains(normalize(n))) {
                return true;
            }
        }
        return false;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT)
                .replace('á', 'a').replace('é', 'e').replace('í', 'i')
                .replace('ó', 'o').replace('ú', 'u').replace('ü', 'u');
    }
}
