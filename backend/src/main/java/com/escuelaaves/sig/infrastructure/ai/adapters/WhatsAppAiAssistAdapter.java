package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.out.WhatsAppAiAssistPort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class WhatsAppAiAssistAdapter implements WhatsAppAiAssistPort {

    private final AiProviderFactory aiProviderFactory;

    @Override
    public String draftAutoReply(String conversationText) {
        return aiProviderFactory.getActiveProvider().suggestReply(conversationText);
    }

    @Override
    public String prioritizeCustomer(String conversationText) {
        var classification = aiProviderFactory.getActiveProvider().classifyConversation(conversationText);
        return "urgency=" + classification.urgency()
                + "; intent=" + classification.intent()
                + "; category=" + classification.category();
    }

    @Override
    public String summarizeThread(String conversationText) {
        return aiProviderFactory.getActiveProvider().summarizeConversation(conversationText);
    }
}
