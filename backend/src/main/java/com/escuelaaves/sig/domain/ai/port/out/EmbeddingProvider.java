package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

/** Proveedor de embeddings (RAG). */
public interface EmbeddingProvider {
    List<Float> embed(String text);
}
