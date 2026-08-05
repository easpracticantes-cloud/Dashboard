package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.conversation.ConversationAssignRequest;
import com.escuelaaves.sig.application.dto.conversation.ConversationDto;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.port.in.ConversationUseCase;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AssignConversationTool implements AiActionTool {

    private final ConversationUseCase conversationUseCase;

    @Override
    public ActionToolType type() {
        return ActionToolType.ASSIGN_CONVERSATION;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID conversationId = ActionArgs.requireUuid(action.args(), "conversationId");
            UUID userId = ActionArgs.requireUuid(action.args(), "assignedUserId");
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true, "Simulación: asignar conversación",
                        Map.of("conversationId", conversationId.toString(), "assignedUserId", userId.toString()));
            }
            ConversationDto dto = conversationUseCase.assignConversation(
                    conversationId, new ConversationAssignRequest(userId));
            return ActionStepResult.ok(type().name(), false, "Conversación asignada",
                    Map.of("conversationId", dto.id().toString()));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
