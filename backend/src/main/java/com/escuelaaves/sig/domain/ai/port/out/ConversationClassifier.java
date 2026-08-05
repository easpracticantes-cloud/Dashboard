package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.ConversationClassification;

public interface ConversationClassifier {
    ConversationClassification classifyConversation(String conversationText);
}
