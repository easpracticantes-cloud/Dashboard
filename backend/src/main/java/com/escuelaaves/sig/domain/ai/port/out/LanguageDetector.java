package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.LanguageDetection;

public interface LanguageDetector {
    LanguageDetection detectLanguage(String text);
}
