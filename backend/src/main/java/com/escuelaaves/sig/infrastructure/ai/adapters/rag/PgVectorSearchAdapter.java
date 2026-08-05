package com.escuelaaves.sig.infrastructure.ai.adapters.rag;

import com.escuelaaves.sig.domain.ai.port.out.VectorSearchPort;

import java.util.List;

/**
 * Stub documentado para futura integración con PostgreSQL pgvector.
 * No es un bean Spring en fase 1 (evitar colisión con {@link InMemoryOrNoOpKnowledgeAdapter}).
 * Cuando se active la extensión: anotar @Component + @Primary y migrar embeddings reales.
 */
public class PgVectorSearchAdapter implements VectorSearchPort {

    @Override
    public List<String> similaritySearch(List<Float> embedding, int topK) {
        throw new UnsupportedOperationException(
                "PgVectorSearchAdapter no habilitado. Use InMemoryOrNoOpKnowledgeAdapter o active pgvector."
        );
    }
}
