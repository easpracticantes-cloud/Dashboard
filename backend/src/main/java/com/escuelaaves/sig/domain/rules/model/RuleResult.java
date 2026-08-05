package com.escuelaaves.sig.domain.rules.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record RuleResult(
        List<String> appliedRuleCodes,
        List<String> messages,
        Map<String, Object> flags,
        Map<String, Object> adjustments
) {
    public static RuleResult empty() {
        return new RuleResult(List.of(), List.of(), Map.of(), Map.of());
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private final List<String> applied = new ArrayList<>();
        private final List<String> messages = new ArrayList<>();
        private final Map<String, Object> flags = new LinkedHashMap<>();
        private final Map<String, Object> adjustments = new LinkedHashMap<>();

        public Builder apply(String code, String message) {
            applied.add(code);
            if (message != null && !message.isBlank()) {
                messages.add(message);
            }
            return this;
        }

        public Builder flag(String key, Object value) {
            flags.put(key, value);
            return this;
        }

        public Builder adjustment(String key, Object value) {
            adjustments.put(key, value);
            return this;
        }

        public RuleResult build() {
            return new RuleResult(
                    List.copyOf(applied),
                    List.copyOf(messages),
                    Map.copyOf(flags),
                    Map.copyOf(adjustments)
            );
        }
    }
}
