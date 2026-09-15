package com.escuelaaves.sig.infrastructure.adapter.in.web;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * BFF / proxy hacia el microservicio Contabilidad (FastAPI) en la red Docker o local.
 * Frontend → {@code /api/v1/contabilidad/**} (JWT SIG + roles Contabilidad)
 * → {@code CONTABLE_API_BASE/api/**} con identidad en {@code X-SIG-Username} / {@code X-SIG-Role}.
 * En Oracle: CONTABLE_API_BASE=http://contabilidad:8787 (no exponer FastAPI públicamente).
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/contabilidad")
public class ContabilidadProxyController {

    public static final String HEADER_SIG_USERNAME = "X-SIG-Username";
    public static final String HEADER_SIG_ROLE = "X-SIG-Role";

    private final RestClient.Builder restClientBuilder;
    private final String contableBase;

    public ContabilidadProxyController(
            RestClient.Builder restClientBuilder,
            @Value("${app.contabilidad.api-base:http://localhost:8787}") String contableBase
    ) {
        this.restClientBuilder = restClientBuilder;
        this.contableBase = contableBase.replaceAll("/$", "");
        log.info("[ContabilidadProxy] api-base={}", this.contableBase);
    }

    @RequestMapping(value = "/**", method = {
            RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
            RequestMethod.PATCH, RequestMethod.DELETE, RequestMethod.OPTIONS
    })
    public ResponseEntity<byte[]> proxy(HttpServletRequest request) throws IOException {
        String uri = request.getRequestURI();
        String context = request.getContextPath() == null ? "" : request.getContextPath();
        String relative = uri.startsWith(context) ? uri.substring(context.length()) : uri;
        String marker = "/api/v1/contabilidad";
        int markerAt = relative.indexOf(marker);
        if (markerAt < 0) {
            return ResponseEntity.status(404)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"detail\":\"Ruta Contabilidad no reconocida.\"}".getBytes(StandardCharsets.UTF_8));
        }
        String suffix = relative.substring(markerAt + marker.length());
        if (suffix.isBlank()) {
            suffix = "/";
        }
        String query = request.getQueryString();
        String target = contableBase + "/api" + suffix + (query != null && !query.isBlank() ? "?" + query : "");

        HttpMethod method = HttpMethod.valueOf(request.getMethod());
        HttpHeaders headers = new HttpHeaders();
        copyRequestHeaders(request, headers);

        try {
            String contentType = request.getContentType();
            boolean multipart = contentType != null
                    && contentType.toLowerCase().startsWith("multipart/");
            if (multipart && request instanceof MultipartHttpServletRequest multi) {
                return forwardMultipart(target, method, headers, multi);
            }

            byte[] payload = StreamUtils.copyToByteArray(request.getInputStream());
            RestClient client = restClientBuilder.build();
            RestClient.RequestBodySpec spec = client
                    .method(method)
                    .uri(URI.create(target))
                    .headers(h -> h.addAll(headers));

            if (contentType != null && !contentType.isBlank()) {
                spec = spec.header(HttpHeaders.CONTENT_TYPE, contentType);
            }

            ResponseEntity<byte[]> upstream = payload.length > 0
                    ? spec.body(payload).retrieve().toEntity(byte[].class)
                    : spec.retrieve().toEntity(byte[].class);

            return ResponseEntity.status(upstream.getStatusCode())
                    .headers(filterResponseHeaders(upstream.getHeaders()))
                    .body(upstream.getBody());
        } catch (RestClientResponseException ex) {
            log.warn("[ContabilidadProxy] upstream {} → {}", target, ex.getStatusCode());
            byte[] body = ex.getResponseBodyAsByteArray();
            if (body == null || body.length == 0) {
                String fallback = "{\"detail\":\"" + ex.getStatusCode().value()
                        + " " + ex.getStatusText() + "\"}";
                body = fallback.getBytes(StandardCharsets.UTF_8);
            }
            return ResponseEntity.status(ex.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body);
        } catch (Exception ex) {
            log.error("[ContabilidadProxy] Error llamando {}: {}", target, ex.getMessage(), ex);
            String hint = contableBase.contains("localhost")
                    ? " Arranca el servicio Contabilidad o define CONTABLE_API_BASE=http://contabilidad:8787 en Docker."
                    : " Revisa que el contenedor contabilidad esté healthy y CONTABLE_API_BASE apunte a la red Docker.";
            String msg = "{\"detail\":\"Servicio Contabilidad no disponible." + hint + "\",\"message\":\"Servicio Contabilidad no disponible." + hint + "\"}";
            return ResponseEntity.status(502)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(msg.getBytes(StandardCharsets.UTF_8));
        }
    }

    private ResponseEntity<byte[]> forwardMultipart(
            String target,
            HttpMethod method,
            HttpHeaders headers,
            MultipartHttpServletRequest multipart
    ) throws IOException {
        headers.remove(HttpHeaders.CONTENT_TYPE);
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        int fileParts = 0;

        multipart.getParameterMap().forEach((key, values) -> {
            if (values == null) {
                return;
            }
            for (String v : values) {
                builder.part(key, v == null ? "" : v);
            }
        });

        for (Map.Entry<String, List<MultipartFile>> entry : multipart.getMultiFileMap().entrySet()) {
            List<MultipartFile> files = entry.getValue();
            if (files == null) {
                continue;
            }
            for (MultipartFile file : files) {
                if (file == null) {
                    continue;
                }
                byte[] bytes = file.getBytes();
                if (bytes.length == 0) {
                    log.warn("[ContabilidadProxy] Parte vacía ignorada: field={} name={}",
                            entry.getKey(), file.getOriginalFilename());
                    continue;
                }
                String filename = file.getOriginalFilename();
                if (filename == null || filename.isBlank()) {
                    filename = "archivo.bin";
                }
                final String partName = filename;
                ByteArrayResource resource = new ByteArrayResource(bytes) {
                    @Override
                    public String getFilename() {
                        return partName;
                    }
                };
                MediaType partType = MediaType.APPLICATION_OCTET_STREAM;
                String ct = file.getContentType();
                if (ct != null && !ct.isBlank()) {
                    try {
                        partType = MediaType.parseMediaType(ct);
                    } catch (Exception ignored) {
                        // keep octet-stream
                    }
                }
                builder.part(entry.getKey(), resource)
                        .filename(partName)
                        .contentType(partType);
                fileParts++;
            }
        }

        if (fileParts == 0 && target.contains("/upload")) {
            log.warn("[ContabilidadProxy] Multipart sin archivos hacia {}", target);
            return ResponseEntity.status(400)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"detail\":\"No se recibieron archivos en la subida (multipart vacío).\"}"
                            .getBytes(StandardCharsets.UTF_8));
        }

        log.info("[ContabilidadProxy] multipart → {} ({} archivo(s))", target, fileParts);
        ResponseEntity<byte[]> upstream = restClientBuilder.build()
                .method(method)
                .uri(URI.create(target))
                .headers(h -> h.addAll(headers))
                .body(builder.build())
                .retrieve()
                .toEntity(byte[].class);

        return ResponseEntity.status(upstream.getStatusCode())
                .headers(filterResponseHeaders(upstream.getHeaders()))
                .body(upstream.getBody());
    }

    private void copyRequestHeaders(HttpServletRequest request, HttpHeaders headers) {
        Enumeration<String> names = request.getHeaderNames();
        while (names != null && names.hasMoreElements()) {
            String name = names.nextElement();
            if (name == null) continue;
            String lower = name.toLowerCase();
            if (lower.equals("host") || lower.equals("content-length") || lower.equals("connection")
                    || lower.equals("authorization") || lower.equals("transfer-encoding")
                    || lower.equals("content-type") || lower.equals("accept-encoding")) {
                continue;
            }
            Enumeration<String> values = request.getHeaders(name);
            while (values.hasMoreElements()) {
                headers.add(name, values.nextElement());
            }
        }
        headers.setAccept(List.of(MediaType.ALL));
        injectSigIdentity(headers);
    }

    private void injectSigIdentity(HttpHeaders headers) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null) {
            return;
        }
        String username = auth.getName().trim();
        if (username.isEmpty() || "anonymousUser".equalsIgnoreCase(username)) {
            return;
        }
        headers.set(HEADER_SIG_USERNAME, username);
        String roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a != null && a.startsWith("ROLE_"))
                .map(a -> a.substring("ROLE_".length()))
                .collect(Collectors.joining(","));
        if (!roles.isBlank()) {
            headers.set(HEADER_SIG_ROLE, roles);
        }
    }

    private HttpHeaders filterResponseHeaders(HttpHeaders upstream) {
        HttpHeaders out = new HttpHeaders();
        upstream.forEach((k, v) -> {
            if (k == null) return;
            String lower = k.toLowerCase();
            if (lower.equals("transfer-encoding") || lower.equals("connection")) {
                return;
            }
            out.put(k, v);
        });
        return out;
    }
}
