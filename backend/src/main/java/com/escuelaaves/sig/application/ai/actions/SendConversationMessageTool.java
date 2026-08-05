package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.conversation.MessageCreateRequest;
import com.escuelaaves.sig.application.dto.conversation.MessageDto;
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
public class SendConversationMessageTool implements AiActionTool {

    private final ConversationUseCase conversationUseCase;

    @Override
    public ActionToolType type() {
        return ActionToolType.SEND_CONVERSATION_MESSAGE;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID conversationId = ActionArgs.requireUuid(action.args(), "conversationId");
            String body = ActionArgs.requireStr(action.args(), "body");
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true, "Simulación: enviar mensaje",
                        Map.of("conversationId", conversationId.toString(), "body", body));
            }
            MessageDto msg = conversationUseCase.addMessage(conversationId, new MessageCreateRequest(body));
            return ActionStepResult.ok(type().name(), false, "Mensaje enviado",
                    Map.of("messageId", msg.id().toString(), "body", msg.body() != null ? msg.body() : ""));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
