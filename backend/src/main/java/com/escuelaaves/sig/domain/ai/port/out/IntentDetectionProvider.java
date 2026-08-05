package com.escuelaaves.sig.domain.ai.port.out;

/** Detecta intención comercial de un mensaje. */
public interface IntentDetectionProvider {
    String detectIntent(String text);
}
