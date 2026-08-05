package com.escuelaaves.sig.infrastructure.ai.adapters.rag;

import com.escuelaaves.sig.domain.ai.port.out.DocumentChunkerPort;
import com.escuelaaves.sig.domain.ai.port.out.DocumentIndexer;
import com.escuelaaves.sig.domain.ai.port.out.EmbeddingProvider;
import com.escuelaaves.sig.domain.ai.port.out.KnowledgeRetrieverPort;
import com.escuelaaves.sig.domain.ai.port.out.KnowledgeSearchProvider;
import com.escuelaaves.sig.domain.ai.port.out.VectorSearchPort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Stub unificado RAG / vector (fase 1). Sin embeddings reales ni pgvector.
 * Contrato listo para sustituir por PgVectorSearchAdapter productivo.
 */
@Slf4j
@Component
public class InMemoryOrNoOpKnowledgeAdapter implements
        EmbeddingProvider,
        KnowledgeSearchProvider,
        VectorSearchPort,
        DocumentIndexer,
        DocumentChunkerPort,
        KnowledgeRetrieverPort {

    @Override
    public List<Float> embed(String text) {
        log.debug("[RAG-stub] embed chars={}", text != null ? text.length() : 0);
        return List.of();
    }

    @Override
    public List<String> search(String query, int limit) {
        return retrieve(query, limit);
    }

    @Override
    public List<String> similaritySearch(List<Float> embedding, int topK) {
        log.debug("[RAG-stub] similaritySearch topK={}", topK);
        return List.of();
    }

    @Override
    public void indexDocument(String documentId, String content, String sourceType) {
        log.info("[RAG-stub] indexDocument id={} type={} (no-op)", documentId, sourceType);
    }

    @Override
    public List<String> chunk(String content, int maxChars) {
        if (content == null || content.isBlank()) {
            return List.of();
        }
        int size = Math.max(64, maxChars);
        List<String> chunks = new ArrayList<>();
        for (int i = 0; i < content.length(); i += size) {
            chunks.add(content.substring(i, Math.min(content.length(), i + size)));
        }
        return chunks;
    }

    @Override
    public List<String> retrieve(String query, int limit) {
        log.debug("[RAG-stub] retrieve queryLen={} limit={}", query != null ? query.length() : 0, limit);
        return List.of();
    }
}
