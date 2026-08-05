package com.escuelaaves.sig.application.rules;

import com.escuelaaves.sig.domain.rules.model.BusinessRule;
import com.escuelaaves.sig.domain.rules.model.RuleAction;
import com.escuelaaves.sig.domain.rules.model.RuleCondition;
import com.escuelaaves.sig.domain.rules.model.RuleContext;
import com.escuelaaves.sig.domain.rules.model.RuleResult;
import com.escuelaaves.sig.domain.rules.port.RuleEnginePort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.BusinessRuleEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RuleActionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RuleConditionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.BusinessRuleJpaRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Motor de reglas de negocio (PostgreSQL). Sin IA.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEngineService implements RuleEnginePort {

    private final BusinessRuleJpaRepository repository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public RuleResult evaluate(RuleContext context) {
        return run(context, false);
    }

    @Override
    @Transactional(readOnly = true)
    public RuleResult simulate(RuleContext context) {
        return run(context, true);
    }

    @Override
    @Transactional(readOnly = true)
    public List<BusinessRule> listActiveRules(String tourCode) {
        List<BusinessRuleEntity> entities = tourCode == null || tourCode.isBlank()
                ? repository.findAllActive()
                : repository.findActiveForTour(tourCode);
        return entities.stream()
                .sorted(Comparator.comparingInt(BusinessRuleEntity::getPriority).reversed())
                .map(this::toDomain)
                .toList();
    }

    private RuleResult run(RuleContext context, boolean simulate) {
        if (context == null) {
            return RuleResult.empty();
        }
        String tour = context.tourCode() != null ? context.tourCode() : "";
        List<BusinessRuleEntity> rules = repository.findActiveForTour(tour.isBlank() ? "" : tour);
        RuleResult.Builder builder = RuleResult.builder();

        rules.stream()
                .sorted(Comparator.comparingInt(BusinessRuleEntity::getPriority).reversed())
                .forEach(rule -> {
                    if (matchesAll(rule, context)) {
                        String msg = rule.getDescription() != null ? rule.getDescription() : rule.getName();
                        builder.apply(rule.getCode(), (simulate ? "[SIM] " : "") + msg);
                        for (RuleActionEntity action : rule.getActions()) {
                            applyAction(builder, action);
                        }
                        log.debug("[Rules] applied code={} simulate={}", rule.getCode(), simulate);
                    }
                });

        return builder.build();
    }

    private boolean matchesAll(BusinessRuleEntity rule, RuleContext context) {
        if (rule.getConditions() == null || rule.getConditions().isEmpty()) {
            return true;
        }
        return rule.getConditions().stream().allMatch(c -> matches(c, context));
    }

    private boolean matches(RuleConditionEntity condition, RuleContext context) {
        Object actual = context.field(condition.getField());
        String op = condition.getOperator() == null ? "EQ" : condition.getOperator().trim().toUpperCase(Locale.ROOT);
        String expectedRaw = unwrapJsonScalar(condition.getValueJson());

        return switch (op) {
            case "EQ", "EQUALS" -> compareEquals(actual, expectedRaw);
            case "NEQ", "NOT_EQUALS" -> !compareEquals(actual, expectedRaw);
            case "GT" -> compareNumber(actual, expectedRaw) > 0;
            case "GTE", "GE" -> compareNumber(actual, expectedRaw) >= 0;
            case "LT" -> compareNumber(actual, expectedRaw) < 0;
            case "LTE", "LE" -> compareNumber(actual, expectedRaw) <= 0;
            case "CONTAINS" -> actual != null && actual.toString().toLowerCase(Locale.ROOT)
                    .contains(expectedRaw.toLowerCase(Locale.ROOT));
            case "IN" -> inList(actual, condition.getValueJson());
            default -> false;
        };
    }

    private void applyAction(RuleResult.Builder builder, RuleActionEntity action) {
        String type = action.getActionType();
        String payload = action.getPayloadJson() != null ? action.getPayloadJson() : "{}";
        builder.adjustment(type, payload);
        try {
            JsonNode node = objectMapper.readTree(payload);
            if (node.has("mode")) {
                builder.flag("transportMode", node.get("mode").asText());
            }
            if (node.has("waiveEntry")) {
                builder.flag("waiveEntryForGuides", node.get("waiveEntry").asBoolean());
            }
            if (node.has("chargeLunch")) {
                builder.flag("chargeLunchForGuides", node.get("chargeLunch").asBoolean());
            }
            if (node.has("checklistCode")) {
                builder.flag("checklistCode", node.get("checklistCode").asText());
            }
            if (node.has("transport")) {
                builder.flag("suggestTransport", node.get("transport").asBoolean());
            }
            if (node.has("message")) {
                builder.apply(type, node.get("message").asText());
            }
        } catch (Exception ex) {
            log.warn("[Rules] payload no parseable type={}: {}", type, ex.getMessage());
        }
    }

    private BusinessRule toDomain(BusinessRuleEntity e) {
        List<RuleCondition> conditions = e.getConditions() == null ? List.of() : e.getConditions().stream()
                .map(c -> new RuleCondition(c.getField(), c.getOperator(), c.getValueJson()))
                .toList();
        List<RuleAction> actions = e.getActions() == null ? List.of() : e.getActions().stream()
                .map(a -> new RuleAction(a.getActionType(), a.getPayloadJson()))
                .toList();
        return new BusinessRule(e.getId(), e.getCode(), e.getName(), e.getPriority(), e.isActive(),
                e.getTourCode(), conditions, actions);
    }

    private static String unwrapJsonScalar(String raw) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim();
        if ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'"))) {
            return t.substring(1, t.length() - 1);
        }
        return t;
    }

    private static boolean compareEquals(Object actual, String expected) {
        if (actual == null) {
            return expected == null || expected.isBlank() || "null".equalsIgnoreCase(expected);
        }
        if (actual instanceof Boolean b) {
            return Boolean.parseBoolean(expected) == b;
        }
        if (actual instanceof Number n) {
            try {
                return new BigDecimal(expected).compareTo(new BigDecimal(n.toString())) == 0;
            } catch (Exception ex) {
                return false;
            }
        }
        return actual.toString().equalsIgnoreCase(expected);
    }

    private static int compareNumber(Object actual, String expected) {
        if (actual == null) {
            return -1;
        }
        try {
            BigDecimal a = new BigDecimal(actual.toString());
            BigDecimal e = new BigDecimal(expected);
            return a.compareTo(e);
        } catch (Exception ex) {
            return -1;
        }
    }

    private boolean inList(Object actual, String valueJson) {
        try {
            JsonNode node = objectMapper.readTree(valueJson);
            if (!node.isArray()) {
                return compareEquals(actual, unwrapJsonScalar(valueJson));
            }
            for (JsonNode n : node) {
                if (compareEquals(actual, n.asText())) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            // fallthrough
        }
        return false;
    }
}
