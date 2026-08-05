package com.escuelaaves.sig.domain.ai.port.out;

/** Chat libre con un modelo generativo. */
public interface GenerativeChatProvider {
    String chat(String systemPrompt, String userMessage);
}
