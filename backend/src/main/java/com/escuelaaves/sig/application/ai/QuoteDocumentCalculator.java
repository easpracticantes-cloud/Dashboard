package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteLineItemDto;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Fuente de verdad de totales de cotización en COP (BigDecimal, escala 0).
 */
@Component
public class QuoteDocumentCalculator {

    public static final BigDecimal IVA_RATE = new BigDecimal("0.19");

    public QuoteDraftDto normalize(QuoteDraftDto raw) {
        QuoteDraftDto src = raw != null ? raw : empty();
        List<QuoteLineItemDto> items = resolveItems(src);
        List<QuoteLineItemDto> computed = new ArrayList<>();
        BigDecimal documentTotal = BigDecimal.ZERO;
        for (QuoteLineItemDto item : items) {
            QuoteLineItemDto line = computeLine(item);
            computed.add(line);
            documentTotal = documentTotal.add(cop(line.total()));
        }
        MoneySplit split = splitIvaIncluded(documentTotal);
        QuoteLineItemDto first = computed.isEmpty() ? null : computed.get(0);
        return new QuoteDraftDto(
                src.code(),
                src.name() != null ? src.name() : (first != null ? first.description() : null),
                src.modality(),
                src.people() != null && src.people() > 0
                        ? src.people()
                        : (first != null && first.quantity() != null ? first.quantity() : 1),
                first != null ? first.unitPrice() : cop(src.unitPrice()),
                split.total(),
                src.currency() != null && !src.currency().isBlank() ? src.currency() : "COP",
                src.date() != null ? src.date() : src.issuedAt(),
                src.pickup(),
                trim(src.clientName()),
                src.notes(),
                src.includes(),
                src.excludes(),
                src.reviewFlag(),
                src.priceScaleByPax(),
                computed,
                trim(src.clientNit()),
                trim(src.clientPhone()),
                trim(src.clientEmail()),
                trim(src.clientCity()),
                trim(src.clientContact()),
                trim(src.clientAddress()),
                trim(src.advisorName()),
                trim(src.quoteNumber()),
                src.issuedAt() != null ? src.issuedAt() : src.date(),
                src.validUntil(),
                src.observations() != null ? src.observations() : src.notes(),
                src.commercialConditions(),
                src.status() != null && !src.status().isBlank()
                        ? src.status().toUpperCase(Locale.ROOT)
                        : "DRAFT"
        );
    }

    public List<String> validateForSave(QuoteDraftDto document) {
        List<String> errors = new ArrayList<>();
        if (document == null) {
            errors.add("La cotización está vacía.");
            return errors;
        }
        if (blank(document.clientName())) {
            errors.add("El cliente es obligatorio.");
        }
        List<QuoteLineItemDto> items = document.items() != null ? document.items() : List.of();
        List<QuoteLineItemDto> usable = items.stream()
                .filter(item -> !blank(item.description()))
                .toList();
        if (usable.isEmpty()) {
            errors.add("Agrega al menos un producto o servicio.");
        }
        for (QuoteLineItemDto item : usable) {
            if (item.quantity() == null || item.quantity() <= 0) {
                errors.add("Las cantidades deben ser mayores a cero.");
                break;
            }
        }
        for (QuoteLineItemDto item : usable) {
            if (neg(item.unitPrice()) || neg(item.discount()) || neg(item.total())) {
                errors.add("Los valores monetarios no pueden ser negativos.");
                break;
            }
            BigDecimal gross = cop(item.quantity()).multiply(cop(item.unitPrice())).setScale(0, RoundingMode.HALF_UP);
            if (cop(item.discount()).compareTo(gross) > 0) {
                errors.add("El descuento no puede superar el valor de la línea.");
                break;
            }
        }
        LocalDate issued = parseDate(document.issuedAt() != null ? document.issuedAt() : document.date());
        LocalDate valid = parseDate(document.validUntil());
        if (document.issuedAt() != null && issued == null) {
            errors.add("La fecha de emisión no es válida.");
        }
        if (document.validUntil() != null && valid == null) {
            errors.add("La vigencia no es válida.");
        }
        if (issued != null && valid != null && valid.isBefore(issued)) {
            errors.add("La vigencia debe ser posterior a la fecha de emisión.");
        }
        return errors;
    }

    public QuoteLineItemDto computeLine(QuoteLineItemDto item) {
        QuoteLineItemDto src = item != null
                ? item
                : new QuoteLineItemDto("", 1, "pax", BigDecimal.ZERO, BigDecimal.ZERO, null, BigDecimal.ZERO);
        BigDecimal qty = src.quantity() != null ? BigDecimal.valueOf(src.quantity()) : BigDecimal.ONE;
        if (qty.signum() < 0) {
            qty = BigDecimal.ZERO;
        }
        BigDecimal unit = cop(src.unitPrice());
        BigDecimal discount = cop(src.discount());
        BigDecimal gross = qty.multiply(unit).setScale(0, RoundingMode.HALF_UP);
        BigDecimal total = gross.subtract(discount).max(BigDecimal.ZERO);
        MoneySplit split = splitIvaIncluded(total);
        return new QuoteLineItemDto(
                src.description() != null ? src.description() : "",
                qty.intValue(),
                src.unit() != null && !src.unit().isBlank() ? src.unit() : "pax",
                unit,
                discount,
                split.iva(),
                total
        );
    }

    public MoneySplit splitIvaIncluded(BigDecimal total) {
        BigDecimal raw = cop(total).max(BigDecimal.ZERO);
        BigDecimal subtotal = raw.divide(BigDecimal.ONE.add(IVA_RATE), 0, RoundingMode.HALF_UP);
        return new MoneySplit(subtotal, raw.subtract(subtotal), raw);
    }

    private List<QuoteLineItemDto> resolveItems(QuoteDraftDto src) {
        if (src.items() != null && !src.items().isEmpty()) {
            return src.items();
        }
        int people = src.people() != null && src.people() > 0 ? src.people() : 1;
        BigDecimal unit = cop(src.unitPrice());
        BigDecimal total = cop(src.total());
        if (unit.signum() == 0 && total.signum() > 0) {
            unit = total.divide(BigDecimal.valueOf(people), 0, RoundingMode.HALF_UP);
        }
        String description = src.name() != null ? src.name() : "";
        return List.of(new QuoteLineItemDto(
                description, people, "pax", unit, BigDecimal.ZERO, null, total
        ));
    }

    private static BigDecimal cop(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(0, RoundingMode.HALF_UP);
    }

    private static BigDecimal cop(Integer value) {
        return value == null ? BigDecimal.ZERO : BigDecimal.valueOf(value);
    }

    private static boolean neg(BigDecimal value) {
        return value != null && value.signum() < 0;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String t = value.trim();
        return t.isEmpty() ? null : t;
    }

    private static LocalDate parseDate(String value) {
        if (blank(value)) {
            return null;
        }
        try {
            if (value.matches("\\d{4}-\\d{2}-\\d{2}.*")) {
                return LocalDate.parse(value.substring(0, 10));
            }
            if (value.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) {
                String[] p = value.split("/");
                return LocalDate.of(Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]));
            }
            return LocalDate.parse(value);
        } catch (DateTimeParseException | NumberFormatException ex) {
            return null;
        }
    }

    private static QuoteDraftDto empty() {
        return new QuoteDraftDto(
                null, null, "PRIVADO", 1, BigDecimal.ZERO, BigDecimal.ZERO, "COP",
                null, null, null, null, null, null, false, java.util.Map.of()
        );
    }

    public record MoneySplit(BigDecimal subtotal, BigDecimal iva, BigDecimal total) {
    }
}
