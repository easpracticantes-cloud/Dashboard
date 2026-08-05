package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

public interface VectorSearchPort {
    List<String> similaritySearch(List<Float> embedding, int topK);
}
