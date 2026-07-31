package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.domain.model.GoogleUserInfo;
import com.escuelaaves.sig.domain.port.out.integration.GoogleTokenVerifierPort;
import com.escuelaaves.sig.shared.exception.UnauthorizedException;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken.Payload;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Collections;

/**
 * Adaptador que valida credenciales de Google:
 * - ID Token (credential de GIS)
 * - Access Token (popup OAuth → selector de cuentas)
 */
@Slf4j
@Component
public class GoogleAuthAdapter implements GoogleTokenVerifierPort {

    private static final String USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

    private final String clientId;
    private final GoogleIdTokenVerifier verifier;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public GoogleAuthAdapter(
            @Value("${app.google.client-id:}") String clientId,
            ObjectMapper objectMapper) {
        this.clientId = clientId;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
        this.verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(clientId == null || clientId.isBlank()
                        ? Collections.emptyList()
                        : Collections.singletonList(clientId))
                .build();
        log.info("[GOOGLE-AUTH-AUDIT] GoogleAuthAdapter init: clientIdPresent={}, clientId=[{}], "
                        + "GOOGLE_CLIENT_ID getenvPresent={}, audienceSize={}",
                clientId != null && !clientId.isBlank(),
                clientId,
                System.getenv("GOOGLE_CLIENT_ID") != null,
                clientId == null || clientId.isBlank() ? 0 : 1);
    }

    @Override
    public GoogleUserInfo verifyIdToken(String idToken) {
        ensureConfigured();
        if (idToken == null || idToken.isBlank()) {
            throw new UnauthorizedException("Token de Google ausente");
        }

        try {
            log.info("[GOOGLE-AUTH-AUDIT] verifyIdToken: usando Client ID (audience) = [{}]", clientId);
            GoogleIdToken token = verifier.verify(idToken);
            if (token == null) {
                throw new UnauthorizedException("Token de Google inválido o expirado");
            }
            Payload payload = token.getPayload();
            String email = payload.getEmail();
            String name = (String) payload.get("name");
            log.info("[GOOGLE-AUTH-AUDIT] verifyIdToken OK: email=[{}], name=[{}], emailVerified={}, aud={}",
                    email, name, payload.getEmailVerified(), payload.getAudience());
            return new GoogleUserInfo(
                    payload.getSubject(),
                    email,
                    Boolean.TRUE.equals(payload.getEmailVerified()),
                    name,
                    (String) payload.get("picture")
            );
        } catch (UnauthorizedException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("Fallo al verificar Google ID Token: {}", ex.getMessage());
            throw new UnauthorizedException("No se pudo validar el token de Google");
        }
    }

    @Override
    public GoogleUserInfo verifyAccessToken(String accessToken) {
        ensureConfigured();
        if (accessToken == null || accessToken.isBlank()) {
            throw new UnauthorizedException("Token de Google ausente");
        }

        try {
            log.info("[GOOGLE-AUTH-AUDIT] verifyAccessToken: Client ID configurado en adapter = [{}] "
                            + "(userinfo no usa audience; se registra para correlación)",
                    clientId);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(USERINFO_URL))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + accessToken)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Google userinfo respondió {}: {}", response.statusCode(), response.body());
                throw new UnauthorizedException("Token de Google inválido o expirado");
            }

            JsonNode json = objectMapper.readTree(response.body());
            String email = text(json, "email");
            if (email == null || email.isBlank()) {
                throw new UnauthorizedException("Google no devolvió un correo electrónico");
            }
            boolean verified = json.path("email_verified").asBoolean(false)
                    || "true".equalsIgnoreCase(text(json, "email_verified"));
            String name = text(json, "name");
            log.info("[GOOGLE-AUTH-AUDIT] verifyAccessToken OK: email=[{}], name=[{}], emailVerified={}",
                    email, name, verified);

            return new GoogleUserInfo(
                    text(json, "sub"),
                    email,
                    verified,
                    name,
                    text(json, "picture")
            );
        } catch (UnauthorizedException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("Fallo al verificar Google Access Token: {}", ex.getMessage());
            throw new UnauthorizedException("No se pudo validar el acceso con Google");
        }
    }

    private void ensureConfigured() {
        if (clientId == null || clientId.isBlank()) {
            log.error("app.google.client-id no está configurado; no se puede validar el login con Google");
            log.error("[GOOGLE-AUTH-AUDIT] ensureConfigured FAIL: GOOGLE_CLIENT_ID getenv=[{}] "
                            + "app.google.client-id resuelto blank. Origen probable: variable no definida en Render "
                            + "ni en application.yml (default vacío).",
                    System.getenv("GOOGLE_CLIENT_ID"));
            throw new UnauthorizedException("Login con Google no está configurado en el servidor");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
