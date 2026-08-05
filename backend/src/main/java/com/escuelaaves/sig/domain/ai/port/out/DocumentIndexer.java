package com.escuelaaves.sig.domain.ai.port.out;

public interface DocumentIndexer {
    void indexDocument(String documentId, String content, String sourceType);
}
