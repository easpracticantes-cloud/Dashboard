package com.escuelaaves.sig.application.ai.actions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

final class ActionArgs {

    private ActionArgs() {
    }

    static String str(Map<String, Object> args, String key) {
        Object v = args.get(key);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isBlank() || "null".equalsIgnoreCase(s) ? null : s;
    }

    static String requireStr(Map<String, Object> args, String key) {
        String s = str(args, key);
        if (s == null) {
            throw new IllegalArgumentException("Falta argumento: " + key);
        }
        return s;
    }

    static UUID uuid(Map<String, Object> args, String key) {
        String s = str(args, key);
        if (s == null) {
            return null;
        }
        return UUID.fromString(s);
    }

    static UUID requireUuid(Map<String, Object> args, String key) {
        UUID id = uuid(args, key);
        if (id == null) {
            throw new IllegalArgumentException("Falta UUID: " + key);
        }
        return id;
    }

    static int intVal(Map<String, Object> args, String key, int defaultValue) {
        Object v = args.get(key);
        if (v == null) {
            return defaultValue;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        return Integer.parseInt(String.valueOf(v).trim());
    }

    static BigDecimal decimal(Map<String, Object> args, String key) {
        Object v = args.get(key);
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal bd) {
            return bd;
        }
        if (v instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        return new BigDecimal(String.valueOf(v).trim());
    }

    static LocalDate date(Map<String, Object> args, String key) {
        String s = str(args, key);
        if (s == null) {
            return null;
        }
        return LocalDate.parse(s);
    }
}
