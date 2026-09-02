package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.ai.CommercialCatalogService.CatalogProduct;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Cotización 100% desde archivos {@code ai/catalogo/}. Sin transacciones ni tablas.
 * A7: cache en memoria de tarifas calculadas (TTL corto).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CatalogQuoteService {

    private static final long CACHE_TTL_MS = 5 * 60_000L;

    private final CommercialCatalogService catalog;
    private final ConcurrentHashMap<String, CachedQuote> tariffCache = new ConcurrentHashMap<>();

    public QuoteResult quote(String naturalMessage) {
        if (naturalMessage == null || naturalMessage.isBlank()) {
            throw new BadRequestException("Mensaje vacío para cotizar");
        }
        QuoteInterpretation hint = HeuristicQuoteInterpreter.interpret(naturalMessage);
        return quote(hint);
    }

    public QuoteResult quote(QuoteInterpretation interpretation) {
        if (interpretation == null) {
            throw new BadRequestException("Interpretación vacía");
        }
        int people = interpretation.people() != null && interpretation.people() > 0
                ? interpretation.people()
                : 2;

        String modality = null;
        String notes = interpretation.rawNotes() != null ? interpretation.rawNotes().toLowerCase(Locale.ROOT) : "";
        String tourHint = interpretation.tour() != null ? interpretation.tour() : "";
        if (notes.contains("compartido") || tourHint.toLowerCase(Locale.ROOT).contains("compartido")) {
            modality = "COMPARTIDO";
        } else if (notes.contains("privado") || tourHint.toLowerCase(Locale.ROOT).contains("privado")) {
            modality = "PRIVADO";
        }

        String cacheKey = (tourHint + "|" + people + "|" + (modality != null ? modality : "")).toUpperCase(Locale.ROOT);
        CachedQuote cached = tariffCache.get(cacheKey);
        if (cached != null && !cached.expired()) {
            log.debug("[CatalogQuote] cache hit key={}", cacheKey);
            return cached.result().withInterpretationMeta(interpretation);
        }

        CatalogProduct product = catalog.findBestMatch(tourHint, modality)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No hay tarifa en ai/catalogo/ para: " + interpretation.tour()
                ));

        BigDecimal unit = catalog.unitPriceForPax(product, people)
                .orElse(product.pricePerPerson1Pax() != null ? product.pricePerPerson1Pax() : BigDecimal.ZERO);
        BigDecimal total = unit.multiply(BigDecimal.valueOf(people)).setScale(0, RoundingMode.HALF_UP);

        String currency = product.currency() != null ? product.currency() : "COP";
        Map<String, BigDecimal> scale = new LinkedHashMap<>();
        product.priceScaleByPax().forEach((k, v) -> scale.put(String.valueOf(k), v));

        StringBuilder markdown = new StringBuilder();
        markdown.append("**").append(product.name()).append("**");
        if (product.modality() != null) {
            markdown.append(" · ").append(product.modality());
        }
        markdown.append("\n\n");
        markdown.append("• Personas: **").append(people).append("**\n");
        markdown.append("• Precio/persona (escala ").append(people).append(" pax): **")
                .append(formatMoney(unit, currency)).append("**\n");
        markdown.append("• **Total: ").append(formatMoney(total, currency)).append("**\n");
        if (product.includes() != null && !product.includes().isBlank()) {
            markdown.append("\nIncluye: ").append(product.includes()).append("\n");
        }
        if (product.excludes() != null && !product.excludes().isBlank()) {
            markdown.append("No incluye: ").append(product.excludes()).append("\n");
        }
        if (product.reviewFlag()) {
            markdown.append("\n⚠️ Tarifa marcada para revisión comercial.\n");
        }
        markdown.append("\n_Abre el panel de revisión para editar y descargar PDF._");

        log.info("[CatalogQuote] code={} people={} unit={} total={}", product.code(), people, unit, total);
        QuoteResult result = new QuoteResult(
                product.code(),
                product.name(),
                product.modality(),
                people,
                unit,
                total,
                currency,
                markdown.toString(),
                product.reviewFlag(),
                interpretation.date(),
                interpretation.pickup(),
                product.includes(),
                product.excludes(),
                interpretation.rawNotes(),
                scale
        );
        tariffCache.put(cacheKey, new CachedQuote(result, System.currentTimeMillis() + CACHE_TTL_MS));
        return result;
    }

    public Optional<QuoteResult> tryQuote(String naturalMessage) {
        try {
            return Optional.of(quote(naturalMessage));
        } catch (Exception ex) {
            log.warn("[CatalogQuote] no cotizable: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public QuoteDraftDto toDraft(QuoteResult q) {
        return new QuoteDraftDto(
                q.code(),
                q.name(),
                q.modality(),
                q.people(),
                q.unitPrice(),
                q.total(),
                q.currency(),
                q.date(),
                q.pickup(),
                null,
                q.notes(),
                q.includes(),
                q.excludes(),
                q.reviewFlag(),
                q.priceScaleByPax()
        );
    }

    private static String formatMoney(BigDecimal amount, String currency) {
        NumberFormat nf = NumberFormat.getNumberInstance(Locale.of("es", "CO"));
        nf.setMaximumFractionDigits(0);
        return "$" + nf.format(amount) + " " + currency;
    }

    public record QuoteResult(
            String code,
            String name,
            String modality,
            int people,
            BigDecimal unitPrice,
            BigDecimal total,
            String currency,
            String markdown,
            boolean reviewFlag,
            String date,
            String pickup,
            String includes,
            String excludes,
            String notes,
            Map<String, BigDecimal> priceScaleByPax
    ) {
        QuoteResult withInterpretationMeta(QuoteInterpretation interpretation) {
            if (interpretation == null) {
                return this;
            }
            return new QuoteResult(
                    code, name, modality, people, unitPrice, total, currency, markdown, reviewFlag,
                    interpretation.date() != null ? interpretation.date() : date,
                    interpretation.pickup() != null ? interpretation.pickup() : pickup,
                    includes, excludes,
                    interpretation.rawNotes() != null ? interpretation.rawNotes() : notes,
                    priceScaleByPax
            );
        }
    }

    private record CachedQuote(QuoteResult result, long expiresAtMs) {
        boolean expired() {
            return System.currentTimeMillis() > expiresAtMs;
        }
    }
}
