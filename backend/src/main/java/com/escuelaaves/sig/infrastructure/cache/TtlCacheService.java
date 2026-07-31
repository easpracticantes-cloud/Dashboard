package com.escuelaaves.sig.infrastructure.cache;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Caché en memoria con TTL (default 60s) para dashboard, métricas, analytics y settings.
 */
@Slf4j
@Service
public class TtlCacheService {

    public static final Duration DEFAULT_TTL = Duration.ofSeconds(60);

    private final Map<String, CacheEntry<?>> store = new ConcurrentHashMap<>();

    /** TTL corto (15s) para hot path del dashboard cuando se pide frescura sin castigar Render. */
    public static final Duration HOT_TTL = Duration.ofSeconds(15);

    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String key, Supplier<T> loader) {
        return getOrLoad(key, DEFAULT_TTL, loader);
    }

    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String key, Duration ttl, Supplier<T> loader) {
        CacheEntry<?> hit = store.get(key);
        if (hit != null && !hit.isExpired()) {
            log.debug("[CACHE-HIT] key={}", key);
            return (T) hit.value();
        }
        long t0 = System.nanoTime();
        T value = loader.get();
        long ms = (System.nanoTime() - t0) / 1_000_000;
        store.put(key, new CacheEntry<>(value, Instant.now().plus(ttl)));
        log.info("[CACHE-MISS] key={} loadedInMs={} ttlSec={}", key, ms, ttl.toSeconds());
        return value;
    }

    public void invalidate(String key) {
        store.remove(key);
    }

    public void invalidateAll() {
        store.clear();
        log.info("[CACHE] invalidateAll");
    }

    public void invalidatePrefix(String prefix) {
        store.keySet().removeIf(k -> k.startsWith(prefix));
    }

    private record CacheEntry<T>(T value, Instant expiresAt) {
        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }
}
