package com.escuelaaves.sig.domain.ai.model;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Estado de slots de una sesión conversacional (Ave / cotizador).
 * Persistencia A3: memoria en proceso; A7 puede mover a Redis/DB.
 */
public final class SessionSlotState {

    private String tourCode;
    private Integer people;
    private String date;
    private String pickup;
    private Boolean transport;
    private Boolean restaurant;
    private String modality;
    private String language;
    private String lastIntent;

    public synchronized void merge(QuoteInterpretation hint) {
        if (hint == null) {
            return;
        }
        if (hint.tour() != null && !hint.tour().isBlank()) {
            this.tourCode = hint.tour().trim().toUpperCase();
        }
        if (hint.people() != null && hint.people() > 0) {
            this.people = hint.people();
        }
        if (hint.date() != null && !hint.date().isBlank()) {
            this.date = hint.date();
        }
        if (hint.pickup() != null && !hint.pickup().isBlank()) {
            this.pickup = hint.pickup();
        }
        if (hint.transport() != null) {
            this.transport = hint.transport();
        }
        if (hint.restaurant() != null) {
            this.restaurant = hint.restaurant();
        }
        if (hint.rawNotes() != null) {
            String n = hint.rawNotes().toLowerCase();
            if (n.contains("compartido")) {
                this.modality = "COMPARTIDO";
            } else if (n.contains("privado")) {
                this.modality = "PRIVADO";
            }
        }
    }

    public synchronized boolean hasCriticalQuoteSlots() {
        return tourCode != null && !tourCode.isBlank() && people != null && people > 0;
    }

    public synchronized Optional<String> missingCriticalPrompt() {
        if (tourCode == null || tourCode.isBlank()) {
            return Optional.of("¿Qué tour o experiencia te interesa cotizar?");
        }
        if (people == null || people <= 0) {
            return Optional.of("¿Para cuántas personas es la cotización?");
        }
        return Optional.empty();
    }

    public synchronized Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        if (tourCode != null) m.put("tourCode", tourCode);
        if (people != null) m.put("people", people);
        if (date != null) m.put("date", date);
        if (pickup != null) m.put("pickup", pickup);
        if (transport != null) m.put("transport", transport);
        if (restaurant != null) m.put("restaurant", restaurant);
        if (modality != null) m.put("modality", modality);
        if (language != null) m.put("language", language);
        if (lastIntent != null) m.put("lastIntent", lastIntent);
        return m;
    }

    public synchronized String toPromptJson() {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : toMap().entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v instanceof Number || v instanceof Boolean) {
                sb.append(v);
            } else {
                sb.append('"').append(String.valueOf(v).replace("\"", "'")).append('"');
            }
        }
        sb.append('}');
        return sb.toString();
    }

    public synchronized String tourCode() { return tourCode; }
    public synchronized Integer people() { return people; }
    public synchronized String modality() { return modality; }

    public synchronized void setLastIntent(String intent) {
        this.lastIntent = intent;
    }
}
