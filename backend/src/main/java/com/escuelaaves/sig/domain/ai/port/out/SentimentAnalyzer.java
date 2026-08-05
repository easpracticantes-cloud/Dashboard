package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;

public interface SentimentAnalyzer {
    SentimentAnalysis analyzeSentiment(String text);
}
