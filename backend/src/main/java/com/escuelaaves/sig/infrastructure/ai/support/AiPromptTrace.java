package com.escuelaaves.sig.infrastructure.ai.support;

import com.escuelaaves.sig.application.ai.AvePromptAssembler;
import lombok.extern.slf4j.Slf4j;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Traza de causa raíz del prompt Anthropic (sin secretos).
 */
@Slf4j
public final class AiPromptTrace {

    private static final ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();

    private static final Pattern SECRET = Pattern.compile(
            "(?i)(sk-ant-|AIza|Bearer\\s+\\S+|api[_-]?key\\s*[:=]\\s*\\S+|anthropic-workspace-id\\s*[:=]\\s*\\S+)"
    );

    private AiPromptTrace() {
    }

    public static void begin(String requestId) {
        REQUEST_ID.set(requestId);
    }

    public static void end() {
        REQUEST_ID.remove();
    }

    public static String currentRequestId() {
        String id = REQUEST_ID.get();
        return id != null ? id : "none";
    }

    public static void logRoot(
            String requestId,
            String sessionId,
            String provider,
            AvePromptAssembler.Assembled assembled,
            boolean fallback
    ) {
        String sidHash = hashSession(sessionId);
        boolean sigAppendix = assembled.systemSources().stream()
                .anyMatch(s -> s.contains("SIG_APPENDIX"));
        log.info("[AI-ROOT-TRACE] requestId={} sessionIdHash={} provider={} businessTurn={} "
                        + "systemLength={} userLength={} historyPresent={} sigAppendixPresent={} "
                        + "catalogPresent={} memoryPresent={} "
                        + "businessTermsInSystem={} businessTermsInUser={} "
                        + "commercialIdentityInSystem={} commercialIdentityInUser={} "
                        + "commercialIdentityInHistory={} systemFingerprint={} fallback={}",
                requestId,
                sidHash,
                provider,
                assembled.businessTurn(),
                assembled.system() != null ? assembled.system().length() : 0,
                assembled.user() != null ? assembled.user().length() : 0,
                assembled.historyPresent(),
                sigAppendix,
                assembled.catalogPresent(),
                assembled.historyPresent(),
                AvePromptAssembler.containsCommercialIdentity(assembled.system()),
                AvePromptAssembler.containsCommercialIdentity(assembled.user()),
                assembled.commercialIdentityInSystem(),
                assembled.commercialIdentityInUser(),
                assembled.commercialIdentityInHistory(),
                assembled.systemFingerprint(),
                fallback
        );
        log.info("[AI-ROOT-TRACE] SYSTEM SOURCES: {}", assembled.systemSources());
        log.info("[AI-ROOT-TRACE] USER SOURCES: {}", assembled.userSources());
        log.info("[AI-ROOT-TRACE] finalSystem=\n{}", scrub(assembled.system()));
        log.info("[AI-ROOT-TRACE] finalUser=\n{}", scrub(truncate(assembled.user(), 4000)));
    }

    public static void logAnthropicWire(String operation, boolean jsonMode, String system, String user) {
        log.info("[AI-ROOT-TRACE] WIRE requestId={} op={} jsonMode={} systemLen={} userLen={} "
                        + "wireSystemCommercial={} wireUserCommercial={}",
                currentRequestId(),
                operation,
                jsonMode,
                system != null ? system.length() : 0,
                user != null ? user.length() : 0,
                AvePromptAssembler.containsCommercialIdentity(system),
                AvePromptAssembler.containsCommercialIdentity(user)
        );
    }

    public static String newRequestId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private static String hashSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return "none";
        }
        return Integer.toHexString(sessionId.hashCode());
    }

    private static String scrub(String raw) {
        if (raw == null) {
            return "";
        }
        return SECRET.matcher(raw).replaceAll("[omitido]");
    }

    private static String truncate(String raw, int max) {
        if (raw == null) {
            return "";
        }
        if (raw.length() <= max) {
            return raw;
        }
        return raw.substring(0, max) + "\n…[AI-ROOT-TRACE truncated]…";
    }
}
