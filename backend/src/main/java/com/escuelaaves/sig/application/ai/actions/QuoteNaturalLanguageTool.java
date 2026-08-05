package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.ai.QuotationOrchestrator;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class QuoteNaturalLanguageTool implements AiActionTool {

    private final QuotationOrchestrator quotationOrchestrator;

    @Override
    public ActionToolType type() {
        return ActionToolType.QUOTE_NATURAL_LANGUAGE;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            String message = ActionArgs.requireStr(action.args(), "message");
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true,
                        "Simulación: cotizar NL (precios desde PostgreSQL)", Map.of("message", message));
            }
            QuotationResponse q = quotationOrchestrator.orchestrate(new QuotationRequest(message, true));
            return ActionStepResult.ok(type().name(), false,
                    "Cotización " + q.tour() + " total=" + q.total() + " " + q.currency(),
                    Map.of(
                            "tour", q.tour() != null ? q.tour() : "",
                            "people", q.people() != null ? q.people() : 0,
                            "total", q.total() != null ? q.total() : 0,
                            "currency", q.currency() != null ? q.currency() : "COP",
                            "emailSubject", q.emailSubject() != null ? q.emailSubject() : ""
                    ));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
