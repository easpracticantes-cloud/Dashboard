package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.rules.RulesDtos.EvaluateRequest;
import com.escuelaaves.sig.application.dto.rules.RulesDtos.EvaluateResponse;
import com.escuelaaves.sig.domain.rules.model.RuleContext;
import com.escuelaaves.sig.domain.rules.model.RuleResult;
import com.escuelaaves.sig.domain.rules.port.RuleEnginePort;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rules")
@RequiredArgsConstructor
@Tag(name = "Business Rules", description = "Motor de reglas de negocio (PostgreSQL, sin IA)")
public class RulesController {

    private final RuleEnginePort ruleEnginePort;

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
