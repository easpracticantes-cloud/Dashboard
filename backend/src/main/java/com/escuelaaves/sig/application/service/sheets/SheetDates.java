package com.escuelaaves.sig.application.service.sheets;

import java.time.LocalDate;
import java.time.Month;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;

/**
 * Fechas de Google Sheets como día de calendario, sin zona horaria.
 * Un ISO {@code 2025-12-30T00:00:00Z} es el 30 de diciembre, no el 29 en Bogotá.
 */
public final class SheetDates {

    public static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final DateTimeFormatter[] DAY_FIRST = {
            DateTimeFormatter.ofPattern("d/M/uuuu"),
            DateTimeFormatter.ofPattern("d-M-uuuu"),
            DateTimeFormatter.ofPattern("d.M.uuuu"),
            DateTimeFormatter.ofPattern("d/M/uu"),
            DateTimeFormatter.ofPattern("d-M-uu")
    };

    private SheetDates() {
    }

    public static String calendar(String raw) {
        LocalDate d = parse(raw);
        return d == null ? blank(raw) : d.toString();
    }

    /** Fecha de contacto: diciembre del año en curso, si aún no es diciembre, es el año anterior. */
    public static String contactFecha(String raw) {
        LocalDate d = parse(raw);
        if (d == null) {
            return blank(raw);
        }
        return rewindPrematureDecember(d, LocalDate.now(BOGOTA)).toString();
    }

    public static LocalDate parse(String raw) {
        if (raw == null) {
            return null;
        }
        String v = raw.trim();
        if (v.isEmpty()) {
            return null;
        }
        if (v.length() >= 10 && v.charAt(4) == '-' && v.charAt(7) == '-') {
            try {
                return LocalDate.parse(v.substring(0, 10));
            } catch (DateTimeParseException ignored) {
                // fall through
            }
        }
        if (v.matches("\\d{4,6}(\\.\\d+)?")) {
            try {
                double n = Double.parseDouble(v);
                if (n > 20000 && n < 80000) {
                    return LocalDate.of(1899, 12, 30).plusDays(Math.round(n));
                }
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        String[] dayMonthYear = firstMatch(v, "(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2,4})");
        if (dayMonthYear != null) {
            int a = Integer.parseInt(dayMonthYear[0]);
            int b = Integer.parseInt(dayMonthYear[1]);
            int y = twoDigitYear(Integer.parseInt(dayMonthYear[2]), dayMonthYear[2].length());
            if (a > 12 && b <= 12) {
                return safeDate(y, b, a);
            }
            if (b > 12 && a <= 12) {
                return safeDate(y, a, b);
            }
            // Colombia: día/mes/año
            LocalDate dm = safeDate(y, b, a);
            if (dm != null) {
                return dm;
            }
            return safeDate(y, a, b);
        }
        for (DateTimeFormatter fmt : DAY_FIRST) {
            try {
                return LocalDate.parse(v, fmt.withLocale(Locale.ROOT));
            } catch (DateTimeParseException ignored) {
                // next
            }
        }
        return null;
    }

    static LocalDate rewindPrematureDecember(LocalDate date, LocalDate today) {
        if (date == null || today == null) {
            return date;
        }
        if (date.getYear() == today.getYear()
                && date.getMonth() == Month.DECEMBER
                && today.getMonth().getValue() < 12) {
            return date.minusYears(1);
        }
        return date;
    }

    private static int twoDigitYear(int year, int digits) {
        if (digits != 2) {
            return year;
        }
        return year >= 100 ? year : 2000 + year;
    }

    private static LocalDate safeDate(int year, int month, int day) {
        try {
            return LocalDate.of(year, month, day);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String[] firstMatch(String v, String regex) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(regex).matcher(v);
        if (!m.find()) {
            return null;
        }
        return new String[] { m.group(1), m.group(2), m.group(3) };
    }

    private static String blank(String raw) {
        return raw == null ? "" : raw.trim();
    }
}
