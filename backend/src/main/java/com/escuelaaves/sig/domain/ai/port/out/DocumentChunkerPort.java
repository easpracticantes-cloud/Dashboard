package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

public interface DocumentChunkerPort {
    List<String> chunk(String content, int maxChars);
}
