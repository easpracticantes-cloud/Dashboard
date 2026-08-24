package com.escuelaaves.sig.application.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Catálogo comercial desde archivos en classpath {@code ai/catalogo/}.
 * No depende de tablas PostgreSQL: la IA lee productos/proveedores de JSON.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CommercialCatalogService {

    private static final String CATALOG_DIR = "ai/catalogo/";
    private static final String LEGACY_SINGLE = "ai/catalogo_comercial_eas_2026.json";

    private final ObjectMapper objectMapper;

    @Getter
    private JsonNode root;

    private final List<CatalogProduct> products = new ArrayList<>();
    private final List<CatalogProvider> providers = new ArrayList<>();

    @PostConstruct
    void load() {
        root = objectMapper.createObjectNode();
        products.clear();
        providers.clear();
        try {
            if (loadFromFolder()) {
                log.info("[CommercialCatalog] folder {} products={} providers={} version={}",
                        CATALOG_DIR, products.size(), providers.size(), text(root, "version"));
                return;
            }
            loadLegacySingleFile();
        } catch (Exception ex) {
            log.error("[CommercialCatalog] No se pudo cargar catálogo: {}", ex.getMessage());
            root = objectMapper.createObjectNode();
        }
    }

    private boolean loadFromFolder() throws Exception {
        ClassPathResource metaRes = new ClassPathResource(CATALOG_DIR + "meta.json");
        ClassPathResource prodRes = new ClassPathResource(CATALOG_DIR + "productos.json");
        ClassPathResource provRes = new ClassPathResource(CATALOG_DIR + "proveedores.json");
        if (!metaRes.exists() && !prodRes.exists()) {
            return false;
        }

        ObjectNode merged = objectMapper.createObjectNode();
        if (metaRes.exists()) {
            try (InputStream in = metaRes.getInputStream()) {
                JsonNode meta = objectMapper.readTree(in);
                meta.fields().forEachRemaining(e -> merged.set(e.getKey(), e.getValue()));
            }
        }

        if (prodRes.exists()) {
            try (InputStream in = prodRes.getInputStream()) {
                JsonNode node = objectMapper.readTree(in);
                JsonNode arr = node.has("products") ? node.get("products") : node;
                merged.set("products", arr);
                if (arr != null && arr.isArray()) {
                    for (JsonNode n : arr) {
                        products.add(CatalogProduct.from(n));
                    }
                }
            }
        }

        // Opcional: un JSON por producto en ai/catalogo/productos/*.json
        loadExtraProductFiles();

        if (provRes.exists()) {
            try (InputStream in = provRes.getInputStream()) {
                JsonNode node = objectMapper.readTree(in);
                JsonNode arr = node.has("providers") ? node.get("providers") : node;
                merged.set("providers", arr);
                if (arr != null && arr.isArray()) {
                    for (JsonNode n : arr) {
                        providers.add(CatalogProvider.from(n));
                    }
                }
            }
        }

        root = merged;
        return !products.isEmpty() || !providers.isEmpty() || metaRes.exists();
    }

    private void loadExtraProductFiles() {
        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] files = resolver.getResources("classpath*:" + CATALOG_DIR + "productos/*.json");
            for (Resource file : files) {
                if (!file.exists() || !file.isReadable()) {
                    continue;
                }
                try (InputStream in = file.getInputStream()) {
                    JsonNode n = objectMapper.readTree(in);
                    if (n.has("products") && n.get("products").isArray()) {
                        for (JsonNode p : n.get("products")) {
                            upsertProduct(CatalogProduct.from(p));
                        }
                    } else if (n.has("code")) {
                        upsertProduct(CatalogProduct.from(n));
                    }
                }
            }
        } catch (Exception ex) {
            log.debug("[CommercialCatalog] sin extras productos/*: {}", ex.getMessage());
        }
    }

    private void upsertProduct(CatalogProduct p) {
        if (p == null || p.code() == null) {
            return;
        }
        products.removeIf(x -> normalize(x.code()).equals(normalize(p.code())));
        products.add(p);
    }

    private void loadLegacySingleFile() throws Exception {
        ClassPathResource legacy = new ClassPathResource(LEGACY_SINGLE);
        if (!legacy.exists()) {
            log.warn("[CommercialCatalog] No hay {} ni {}", CATALOG_DIR, LEGACY_SINGLE);
            return;
        }
        try (InputStream in = legacy.getInputStream()) {
            root = objectMapper.readTree(in);
            if (root.has("products") && root.get("products").isArray()) {
                for (JsonNode n : root.get("products")) {
                    products.add(CatalogProduct.from(n));
                }
            }
            if (root.has("providers") && root.get("providers").isArray()) {
                for (JsonNode n : root.get("providers")) {
                    providers.add(CatalogProvider.from(n));
                }
            }
            log.info("[CommercialCatalog] legacy {} products={} providers={}",
                    LEGACY_SINGLE, products.size(), providers.size());
        }
    }

    public List<CatalogProduct> products() {
        return List.copyOf(products);
    }

    public List<CatalogProvider> providers() {
        return List.copyOf(providers);
    }

    public Optional<CatalogProduct> findByCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        String needle = normalize(code);
        return products.stream()
                .filter(p -> normalize(p.code()).equals(needle))
                .findFirst();
    }

    public Optional<CatalogProduct> findBestMatch(String tourHint, String preferredModality) {
        if (tourHint == null || tourHint.isBlank()) {
            return Optional.empty();
        }
        Optional<CatalogProduct> exact = findByCode(tourHint);
        if (exact.isPresent()) {
            return exact;
        }
        String needle = normalize(tourHint);
        String modality = preferredModality == null ? null : preferredModality.trim().toUpperCase(Locale.ROOT);

        List<CatalogProduct> ranked = products.stream()
                .filter(CatalogProduct::active)
                .filter(p -> score(p, needle) > 0)
                .sorted(Comparator
                        .comparingInt((CatalogProduct p) -> score(p, needle)).reversed()
                        .thenComparing(Comparator.comparingInt((CatalogProduct p) -> modalityBoost(p, modality)).reversed())
                        .thenComparing(CatalogProduct::code))
                .toList();
        return ranked.stream().findFirst();
    }

    public Optional<BigDecimal> unitPriceForPax(CatalogProduct product, int people) {
        if (product == null || product.priceScaleByPax().isEmpty()) {
            return Optional.empty();
        }
        int pax = Math.max(1, people);
        Map<Integer, BigDecimal> scale = product.priceScaleByPax();
        if (scale.containsKey(pax) && scale.get(pax) != null) {
            return Optional.of(scale.get(pax));
        }
        Optional<Integer> maxKey = scale.keySet().stream().filter(k -> scale.get(k) != null).max(Integer::compareTo);
        if (maxKey.isPresent() && pax > maxKey.get()) {
            return Optional.ofNullable(scale.get(maxKey.get()));
        }
        Optional<Integer> nearest = scale.keySet().stream()
                .filter(k -> scale.get(k) != null)
                .min(Comparator.comparingInt(k -> Math.abs(k - pax)));
        return nearest.map(scale::get);
    }

    public String buildPromptIndex(int maxProducts) {
        StringBuilder sb = new StringBuilder();
        sb.append("Catálogo comercial EAS (archivos ai/catalogo/). ");
        sb.append(products.size()).append(" tours. ");
        sb.append("Reglas: no inventar precios; usar priceScaleByPax según #personas; ");
        sb.append("PRIVADO vs COMPARTIDO; no usar costo proveedor como venta.\n");
        int limit = Math.max(1, maxProducts);
        int i = 0;
        for (CatalogProduct p : products) {
            if (!p.active()) {
                continue;
            }
            if (i++ >= limit) {
                break;
            }
            sb.append("- ").append(p.code()).append(" | ").append(p.name())
                    .append(" | ").append(p.modality()).append(" | escala/pax: ");
            p.priceScaleByPax().entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .forEach(e -> sb.append(e.getKey()).append('=').append(e.getValue()).append(' '));
            if (p.reviewFlag()) {
                sb.append("[REVISAR]");
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    public List<String> retrieveSnippets(String query, int limit) {
        if (query == null || query.isBlank() || limit <= 0) {
            return List.of();
        }
        String needle = normalize(query);
        List<String> hits = new ArrayList<>();
        for (CatalogProduct p : products) {
            if (score(p, needle) <= 0) {
                continue;
            }
            StringBuilder line = new StringBuilder();
            line.append("TOUR ").append(p.code()).append(" (").append(p.modality()).append(") ")
                    .append(p.name()).append(". Precios COP/persona: ");
            p.priceScaleByPax().entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .forEach(e -> line.append(e.getKey()).append("pax=").append(e.getValue()).append("; "));
            if (p.includes() != null) {
                line.append(" Incluye: ").append(p.includes());
            }
            if (p.excludes() != null) {
                line.append(" No incluye: ").append(p.excludes());
            }
            if (p.notes() != null) {
                line.append(" Notas: ").append(p.notes());
            }
            if (p.reviewFlag()) {
                line.append(" [REVISAR]");
            }
            hits.add(line.toString());
            if (hits.size() >= limit) {
                return hits;
            }
        }
        for (CatalogProvider pr : providers) {
            if (!pr.active()) {
                continue;
            }
            String blob = normalize(pr.code() + " " + pr.name() + " " + pr.tourCode() + " " + pr.notes());
            if (!blob.contains(needle) && !needle.contains(normalize(pr.name()))) {
                continue;
            }
            hits.add("PROVEEDOR " + pr.code() + " " + pr.name()
                    + " cat=" + pr.category() + " tour=" + pr.tourCode()
                    + (pr.notes() != null ? " | " + pr.notes() : ""));
            if (hits.size() >= limit) {
                break;
            }
        }
        return hits;
    }

    public List<CatalogProvider> suggestProviders(String tourCode, String category) {
        String tour = tourCode == null ? "" : normalize(tourCode);
        String cat = category == null ? "" : category.trim().toUpperCase(Locale.ROOT);
        return providers.stream()
                .filter(CatalogProvider::active)
                .filter(p -> tour.isBlank()
                        || normalize(p.tourCode()).contains(tour)
                        || tour.contains(normalize(p.tourCode())))
                .filter(p -> cat.isBlank() || cat.equalsIgnoreCase(p.category()))
                .sorted(Comparator.comparingInt(CatalogProvider::priority).reversed())
                .toList();
    }

    private static int modalityBoost(CatalogProduct p, String modality) {
        if (modality == null || modality.isBlank()) {
            return p.modality().equals("PRIVADO") ? 1 : 0;
        }
        return modality.equalsIgnoreCase(p.modality()) ? 2 : 0;
    }

    private static int score(CatalogProduct p, String needle) {
        if (needle.isBlank()) {
            return 0;
        }
        int s = 0;
        String code = normalize(p.code());
        String name = normalize(p.name());
        if (code.equals(needle) || name.equals(needle)) {
            s += 100;
        }
        if (code.contains(needle) || needle.contains(code)) {
            s += 40;
        }
        if (name.contains(needle) || needle.contains(name)) {
            s += 30;
        }
        for (String kw : p.keywords()) {
            String k = normalize(kw);
            if (k.isBlank()) {
                continue;
            }
            if (k.equals(needle) || needle.contains(k) || k.contains(needle)) {
                s += 20;
            }
        }
        return s;
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toLowerCase(Locale.ROOT)
                .replace('á', 'a').replace('é', 'e').replace('í', 'i')
                .replace('ó', 'o').replace('ú', 'u').replace('ü', 'u')
                .replace('_', ' ');
    }

    private static String text(JsonNode n, String field) {
        if (n == null) {
            return null;
        }
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    public record CatalogProduct(
            String code,
            String name,
            String modality,
            String currency,
            BigDecimal pricePerPerson1Pax,
            Map<Integer, BigDecimal> priceScaleByPax,
            String includes,
            String excludes,
            String notes,
            List<String> keywords,
            boolean active,
            boolean reviewFlag
    ) {
        static CatalogProduct from(JsonNode n) {
            Map<Integer, BigDecimal> scale = new LinkedHashMap<>();
            JsonNode scaleNode = n.get("priceScaleByPax");
            if (scaleNode != null && scaleNode.isObject()) {
                scaleNode.fields().forEachRemaining(e -> {
                    if (e.getValue() != null && !e.getValue().isNull()) {
                        try {
                            scale.put(Integer.parseInt(e.getKey()), e.getValue().decimalValue());
                        } catch (NumberFormatException ignored) {
                            // skip
                        }
                    }
                });
            }
            List<String> keywords = new ArrayList<>();
            JsonNode kw = n.get("keywords");
            if (kw != null && kw.isArray()) {
                kw.forEach(x -> keywords.add(x.asText()));
            }
            BigDecimal p1 = n.has("pricePerPerson1Pax") && !n.get("pricePerPerson1Pax").isNull()
                    ? n.get("pricePerPerson1Pax").decimalValue()
                    : scale.get(1);
            return new CatalogProduct(
                    text(n, "code"),
                    text(n, "name"),
                    text(n, "modality") != null ? text(n, "modality") : "PRIVADO",
                    text(n, "currency") != null ? text(n, "currency") : "COP",
                    p1,
                    scale,
                    text(n, "includes"),
                    text(n, "excludes"),
                    text(n, "notes"),
                    List.copyOf(keywords),
                    !n.has("active") || n.get("active").asBoolean(true),
                    n.has("reviewFlag") && n.get("reviewFlag").asBoolean(false)
            );
        }
    }

    public record CatalogProvider(
            String code,
            String name,
            String category,
            String tourCode,
            String notes,
            int priority,
            boolean active
    ) {
        static CatalogProvider from(JsonNode n) {
            return new CatalogProvider(
                    text(n, "code"),
                    text(n, "name"),
                    text(n, "category") != null ? text(n, "category") : "EXPERIENCE",
                    text(n, "tourCode"),
                    text(n, "notes"),
                    n.has("priority") ? n.get("priority").asInt(50) : 50,
                    !n.has("active") || n.get("active").asBoolean(true)
            );
        }
    }
}
