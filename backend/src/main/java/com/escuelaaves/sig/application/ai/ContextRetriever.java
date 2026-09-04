package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.ai.CommercialCatalogService.CatalogProduct;
import com.escuelaaves.sig.application.ai.CommercialCatalogService.CatalogProvider;
import com.escuelaaves.sig.domain.ai.model.SessionSlotState;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Recuperación top-K de contexto comercial (anti-dump de catálogo completo).
 */
@Service
@RequiredArgsConstructor
public class ContextRetriever {

    private final CommercialCatalogService catalog;

    public String buildCompactContext(String query, SessionSlotState slots, int productLimit, int providerLimit) {
        return buildCompactContext(query, slots, productLimit, providerLimit, false);
    }

    /**
     * @param indexIfNoHit si true (p. ej. interpretQuote), adjunta un índice corto cuando no hay match.
     *                     En chat general debe ser false para no sesgar a Claude hacia tours.
     */
    public String buildCompactContext(
            String query,
            SessionSlotState slots,
            int productLimit,
            int providerLimit,
            boolean indexIfNoHit
    ) {
        List<ScoredProduct> scored = scoreProducts(query, slots);
        boolean hasTourSlot = slots != null && slots.tourCode() != null && !slots.tourCode().isBlank();
        boolean catalogHit = !scored.isEmpty();

        if (!hasTourSlot && !catalogHit) {
            if (indexIfNoHit) {
                return catalog.buildPromptIndex(Math.min(8, productLimit));
            }
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Contexto de catálogo (solo para esta consulta de negocio; no restringe otros temas):\n");
        if (slots != null && !slots.toMap().isEmpty()) {
            sb.append("Slots sesión: ").append(slots.toPromptJson()).append('\n');
        }

        int limit = Math.max(1, productLimit);
        int n = Math.min(limit, scored.size());
        for (int i = 0; i < n; i++) {
            CatalogProduct p = scored.get(i).product();
            sb.append("- ").append(p.code()).append(" | ").append(p.name())
                    .append(" | ").append(p.modality()).append(" | escala=");
            p.priceScaleByPax().entrySet().stream()
                    .sorted(java.util.Map.Entry.comparingByKey())
                    .forEach(e -> sb.append(e.getKey()).append('=').append(e.getValue()).append(';'));
            if (p.reviewFlag()) {
                sb.append(" [REVISAR]");
            }
            sb.append('\n');
        }

        List<CatalogProvider> providers = catalog.suggestProviders(
                slots != null ? slots.tourCode() : null,
                null
        );
        int pLimit = Math.max(0, providerLimit);
        for (int i = 0; i < Math.min(pLimit, providers.size()); i++) {
            CatalogProvider pr = providers.get(i);
            sb.append("- PROV ").append(pr.code()).append(' ').append(pr.name())
                    .append(" cat=").append(pr.category())
                    .append(" tour=").append(pr.tourCode()).append('\n');
        }

        if (scored.isEmpty() && hasTourSlot) {
            sb.append(catalog.buildPromptIndex(Math.min(8, productLimit)));
        }
        return sb.toString();
    }

    /** Snippets ordenados por score (corrige orden no-top-K del catálogo). */
    public List<String> topSnippets(String query, int limit) {
        List<ScoredProduct> scored = scoreProducts(query, null);
        List<String> out = new ArrayList<>();
        for (ScoredProduct sp : scored) {
            if (out.size() >= limit) {
                break;
            }
            CatalogProduct p = sp.product();
            out.add("TOUR " + p.code() + " (" + p.modality() + ") " + p.name()
                    + " score=" + sp.score());
        }
        return out;
    }

    private List<ScoredProduct> scoreProducts(String query, SessionSlotState slots) {
        String needle = normalize(query);
        if (slots != null && slots.tourCode() != null) {
            needle = normalize(slots.tourCode() + " " + (query != null ? query : ""));
        }
        String modality = slots != null ? slots.modality() : null;
        List<ScoredProduct> list = new ArrayList<>();
        for (CatalogProduct p : catalog.products()) {
            if (!p.active()) {
                continue;
            }
            int s = score(p, needle);
            if (modality != null && modality.equalsIgnoreCase(p.modality())) {
                s += 15;
            }
            if (s >= 20) {
                list.add(new ScoredProduct(p, s));
            }
        }
        list.sort(Comparator.comparingInt(ScoredProduct::score).reversed());
        return list;
    }

    private static int score(CatalogProduct p, String needle) {
        if (needle == null || needle.isBlank()) {
            return 0;
        }
        int s = 0;
        String code = normalize(p.code());
        String name = normalize(p.name());
        if (code.equals(needle) || name.equals(needle)) s += 100;
        if (code.contains(needle) || needle.contains(code)) s += 40;
        if (name.contains(needle) || needle.contains(name)) s += 30;
        for (String token : needle.split("\\s+")) {
            if (token.length() < 4) continue;
            if (code.contains(token) || name.contains(token)) s += 10;
            for (String kw : p.keywords()) {
                String k = normalize(kw);
                if (k.contains(token) || token.contains(k)) s += 12;
            }
        }
        return s;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase(Locale.ROOT)
                .replace('á', 'a').replace('é', 'e').replace('í', 'i')
                .replace('ó', 'o').replace('ú', 'u').replace('ü', 'u')
                .replace('_', ' ');
    }

    private record ScoredProduct(CatalogProduct product, int score) {
    }
}
