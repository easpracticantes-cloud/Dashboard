package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

/** Recuperación RAG sobre documentación oficial. */
public interface KnowledgeRetrieverPort {
    List<String> retrieve(String query, int limit);
}
