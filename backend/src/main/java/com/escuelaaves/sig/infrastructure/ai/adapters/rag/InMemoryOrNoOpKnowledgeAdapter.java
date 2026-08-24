package com.escuelaaves.sig.infrastructure.ai.adapters.rag;

import com.escuelaaves.sig.application.ai.CommercialCatalogService;
import com.escuelaaves.sig.domain.ai.port.out.DocumentChunkerPort;
import com.escuelaaves.sig.domain.ai.port.out.DocumentIndexer;
import com.escuelaaves.sig.domain.ai.port.out.EmbeddingProvider;
import com.escuelaaves.sig.domain.ai.port.out.KnowledgeRetrieverPort;
import com.escuelaaves.sig.domain.ai.port.out.KnowledgeSearchProvider;
import com.escuelaaves.sig.domain.ai.port.out.VectorSearchPort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * RAG ligero: recupera snippets del catálogo comercial 2026.
 * Contrato listo para sustituir por PgVectorSearchAdapter productivo.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InMemoryOrNoOpKnowledgeAdapter implements
        EmbeddingProvider,
        KnowledgeSearchProvider,
        VectorSearchPort,
        DocumentIndexer,
        DocumentChunkerPort,
        KnowledgeRetrieverPort {

    private final CommercialCatalogService commercialCatalog;

    @Override
    public List<Float> embed(String text) {
        log.debug("[RAG] embed chars={}", text != null ? text.length() : 0);
        return List.of();
    }

    @Override
    public List<String> search(String query, int limit) {
        return retrieve(query, limit);
    }

    @Override
    public List<String> similaritySearch(List<Float> embedding, int topK) {
        log.debug("[RAG] similaritySearch topK={} (sin embeddings reales)", topK);
        return List.of();
    }

    @Override
    public void indexDocument(String documentId, String content, String sourceType) {
        log.info("[RAG] indexDocument id={} type={} (no-op; catálogo JSON es fuente)", documentId, sourceType);
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
        int top = Math.max(1, limit);
        List<String> hits = commercialCatalog.retrieveSnippets(query, top);
        log.debug("[RAG] retrieve queryLen={} hits={}", query != null ? query.length() : 0, hits.size());
        return hits;
    }
}
