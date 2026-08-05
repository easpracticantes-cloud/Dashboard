package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.conversation.ConversationDto;
import com.escuelaaves.sig.application.dto.conversation.ConversationStatusUpdateRequest;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import com.escuelaaves.sig.domain.port.in.ConversationUseCase;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SetConversationStatusTool implements AiActionTool {

    private final ConversationUseCase conversationUseCase;

    @Override
    public ActionToolType type() {
        return ActionToolType.SET_CONVERSATION_STATUS;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID conversationId = ActionArgs.requireUuid(action.args(), "conversationId");
            ConversationStatus status = ConversationStatus.valueOf(
                    ActionArgs.requireStr(action.args(), "status").toUpperCase());
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true, "Simulación: status=" + status,
                        Map.of("conversationId", conversationId.toString(), "status", status.name()));
            }
            ConversationDto dto = conversationUseCase.updateStatus(
                    conversationId, new ConversationStatusUpdateRequest(status));
            return ActionStepResult.ok(type().name(), false, "Estado actualizado a " + dto.status(),
                    Map.of("conversationId", dto.id().toString(), "status", dto.status().name()));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
