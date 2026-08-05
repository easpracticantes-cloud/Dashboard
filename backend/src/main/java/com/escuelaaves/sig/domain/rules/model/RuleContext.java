package com.escuelaaves.sig.domain.rules.model;

import java.util.HashMap;
import java.util.Map;

/**
 * Contexto de evaluación de reglas de negocio (sin IA).
 */
public record RuleContext(
        String tourCode,
        Integer people,
        Boolean transport,
        Boolean restaurant,
        Boolean includesGuides,
        Integer guideCount,
        String pickup,
        Map<String, Object> extras
) {
    public RuleContext {
        if (extras == null) {
            extras = Map.of();
        }
    }

    public static RuleContext of(String tourCode, Integer people, Boolean transport, Boolean restaurant) {
        return new RuleContext(tourCode, people, transport, restaurant, false, 0, null, Map.of());
    }

    public Object field(String name) {
        if (name == null) {
            return null;
        }
        return switch (name.trim().toLowerCase()) {
            case "tour", "tour_code", "tourcode" -> tourCode;
            case "people", "pax", "personas" -> people;
            case "transport", "transporte" -> transport;
            case "restaurant", "restaurante" -> restaurant;
            case "includes_guides", "guides" -> includesGuides;
            case "guide_count", "guidecount" -> guideCount;
            case "pickup" -> pickup;
            default -> extras.get(name);
        };
    }

    public Map<String, Object> asMap() {
        Map<String, Object> map = new HashMap<>(extras);
        map.put("tourCode", tourCode);
        map.put("people", people);
        map.put("transport", transport);
        map.put("restaurant", restaurant);
        map.put("includesGuides", includesGuides);
        map.put("guideCount", guideCount);
        map.put("pickup", pickup);
        return map;
    }
}
