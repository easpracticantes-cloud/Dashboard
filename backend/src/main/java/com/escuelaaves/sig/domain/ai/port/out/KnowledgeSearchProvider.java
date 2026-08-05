package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

public interface KnowledgeSearchProvider {
    List<String> search(String query, int limit);
}
