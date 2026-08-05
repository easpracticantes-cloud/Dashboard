package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.GenerateQuoteRequest;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.port.in.AiQuoteUseCase;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class GenerateQuoteFromConversationTool implements AiActionTool {

    private final AiQuoteUseCase aiQuoteUseCase;

    @Override
    public ActionToolType type() {
        return ActionToolType.GENERATE_QUOTE_FROM_CONVERSATION;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID conversationId = ActionArgs.requireUuid(action.args(), "conversationId");
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true,
                        "Simulación: generar cotización desde conversación",
                        Map.of("conversationId", conversationId.toString()));
            }
            QuoteDto quote = aiQuoteUseCase.generateForConversation(conversationId, new GenerateQuoteRequest(
                    ActionArgs.str(action.args(), "title"),
                    ActionArgs.str(action.args(), "experience"),
                    ActionArgs.str(action.args(), "description"),
                    ActionArgs.decimal(action.args(), "amount"),
                    ActionArgs.str(action.args(), "currency"),
                    action.args().containsKey("partySize") ? ActionArgs.intVal(action.args(), "partySize", 1) : null,
                    ActionArgs.date(action.args(), "serviceDate"),
                    ActionArgs.uuid(action.args(), "advisorId")
            ));
            return ActionStepResult.ok(type().name(), false,
                    "Cotización creada: " + quote.code(),
                    Map.of("quoteId", quote.id().toString(), "code", quote.code(),
                            "amount", quote.amount() != null ? quote.amount() : 0));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
