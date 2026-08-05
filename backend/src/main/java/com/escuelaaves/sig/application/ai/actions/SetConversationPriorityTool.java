package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.conversation.ConversationDto;
import com.escuelaaves.sig.application.dto.conversation.ConversationPriorityUpdateRequest;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.port.in.ConversationUseCase;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SetConversationPriorityTool implements AiActionTool {

    private final ConversationUseCase conversationUseCase;

    @Override
    public ActionToolType type() {
        return ActionToolType.SET_CONVERSATION_PRIORITY;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID conversationId = ActionArgs.requireUuid(action.args(), "conversationId");
            ConversationPriority priority = ConversationPriority.valueOf(
                    ActionArgs.requireStr(action.args(), "priority").toUpperCase());
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true, "Simulación: priority=" + priority,
                        Map.of("conversationId", conversationId.toString(), "priority", priority.name()));
            }
            ConversationDto dto = conversationUseCase.updatePriority(
                    conversationId, new ConversationPriorityUpdateRequest(priority));
            return ActionStepResult.ok(type().name(), false, "Prioridad actualizada a " + dto.priority(),
                    Map.of("conversationId", dto.id().toString(), "priority", dto.priority().name()));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
