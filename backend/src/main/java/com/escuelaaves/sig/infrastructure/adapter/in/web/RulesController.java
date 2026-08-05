package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.rules.RulesDtos.EvaluateRequest;
import com.escuelaaves.sig.application.dto.rules.RulesDtos.EvaluateResponse;
import com.escuelaaves.sig.domain.rules.model.BusinessRule;
import com.escuelaaves.sig.domain.rules.model.RuleContext;
import com.escuelaaves.sig.domain.rules.model.RuleResult;
import com.escuelaaves.sig.domain.rules.port.RuleEnginePort;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/rules")
@RequiredArgsConstructor
@Tag(name = "Business Rules", description = "Motor de reglas de negocio (PostgreSQL, sin IA)")
public class RulesController {

    private final RuleEnginePort ruleEnginePort;

    @GetMapping
    @Operation(summary = "Lista reglas activas (admin)")
    public ResponseEntity<List<Map<String, Object>>> list(@RequestParam(required = false) String tourCode) {
        List<BusinessRule> rules = ruleEnginePort.listActiveRules(tourCode);
        List<Map<String, Object>> body = rules.stream()
                .map(r -> Map.<String, Object>of(
                        "id", r.id() != null ? r.id() : 0,
                        "code", r.code(),
                        "name", r.name(),
                        "priority", r.priority(),
                        "active", r.active(),
                        "tourCode", r.tourCode() != null ? r.tourCode() : "",
                        "conditions", r.conditions().size(),
                        "actions", r.actions().size()
                ))
                .toList();
        return ResponseEntity.ok(body);
    }

    @PostMapping("/evaluate")
    @Operation(summary = "Evalúa reglas de negocio activas")
    public ResponseEntity<EvaluateResponse> evaluate(@RequestBody EvaluateRequest request) {
        RuleResult result = ruleEnginePort.evaluate(toContext(request));
        return ResponseEntity.ok(toResponse(result, false));
    }

    @PostMapping("/simulate")
    @Operation(summary = "Simula reglas de negocio (misma lógica, marcadas como simulación)")
    public ResponseEntity<EvaluateResponse> simulate(@RequestBody EvaluateRequest request) {
        RuleResult result = ruleEnginePort.simulate(toContext(request));
        return ResponseEntity.ok(toResponse(result, true));
    }

    private static RuleContext toContext(EvaluateRequest request) {
        if (request == null) {
            return RuleContext.of(null, 1, false, false);
        }
        return new RuleContext(
                request.tourCode(),
                request.people(),
                request.transport(),
                request.restaurant(),
                Boolean.TRUE.equals(request.includesGuides()),
                request.guideCount() != null ? request.guideCount() : 0,
                request.pickup(),
                request.extras() != null ? request.extras() : java.util.Map.of()
        );
    }

    private static EvaluateResponse toResponse(RuleResult result, boolean simulated) {
        return new EvaluateResponse(
                result.appliedRuleCodes(),
                result.messages(),
                result.flags(),
                result.adjustments(),
                simulated
        );
    }
}
