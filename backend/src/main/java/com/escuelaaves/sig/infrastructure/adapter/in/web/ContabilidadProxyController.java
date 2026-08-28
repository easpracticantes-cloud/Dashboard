package com.escuelaaves.sig.infrastructure.adapter.in.web;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
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

/**
 * BFF / proxy hacia el microservicio Contabilidad (FastAPI).
 * El frontend SIG llama {@code /api/v1/contabilidad/**} con JWT;
 * este controlador reenvía a {@code CONTABLE_API_BASE/api/**}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/contabilidad")
public class ContabilidadProxyController {

    private final RestClient.Builder restClientBuilder;
    private final String contableBase;

    public ContabilidadProxyController(
            RestClient.Builder restClientBuilder,
            @Value("${app.contabilidad.api-base:http://localhost:8787}") String contableBase
    ) {
        this.restClientBuilder = restClientBuilder;
        this.contableBase = contableBase.replaceAll("/$", "");
    }

    @RequestMapping(value = "/**", method = {
            RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
            RequestMethod.PATCH, RequestMethod.DELETE, RequestMethod.OPTIONS
    })
    public ResponseEntity<byte[]> proxy(HttpServletRequest request) throws IOException {
        String suffix = request.getRequestURI().substring("/api/v1/contabilidad".length());
        if (suffix.isBlank()) {
            suffix = "/";
        }
        String query = request.getQueryString();
        String target = contableBase + "/api" + suffix + (query != null && !query.isBlank() ? "?" + query : "");

        HttpMethod method = HttpMethod.valueOf(request.getMethod());
        HttpHeaders headers = new HttpHeaders();
        copyRequestHeaders(request, headers);

        try {
            if (request instanceof MultipartHttpServletRequest multipart) {
                return forwardMultipart(target, method, headers, multipart);
            }

            byte[] payload = StreamUtils.copyToByteArray(request.getInputStream());

            RestClient.RequestBodySpec spec = restClientBuilder.build()
                    .method(method)
                    .uri(URI.create(target))
                    .headers(h -> h.addAll(headers));

            ResponseEntity<byte[]> upstream;
            if (payload.length > 0) {
                upstream = spec.body(payload).retrieve().toEntity(byte[].class);
            } else {
                upstream = spec.retrieve().toEntity(byte[].class);
            }
            return ResponseEntity.status(upstream.getStatusCode())
                    .headers(filterResponseHeaders(upstream.getHeaders()))
                    .body(upstream.getBody());
        } catch (RestClientResponseException ex) {
            log.warn("[ContabilidadProxy] upstream {} → {}", target, ex.getStatusCode());
            return ResponseEntity.status(ex.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(ex.getResponseBodyAsByteArray());
        } catch (Exception ex) {
            log.error("[ContabilidadProxy] Error llamando {}: {}", target, ex.getMessage());
            String msg = "{\"message\":\"Servicio Contabilidad no disponible. Arranca contabilidad-service (puerto 8787).\"}";
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
    ) {
        headers.remove(HttpHeaders.CONTENT_TYPE);
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        multipart.getParameterMap().forEach((key, values) -> {
            if (values != null) {
                for (String v : values) {
                    form.add(key, v);
                }
            }
        });
        for (Map.Entry<String, MultipartFile> entry : multipart.getFileMap().entrySet()) {
            MultipartFile file = entry.getValue();
            if (file == null || file.isEmpty()) {
                continue;
            }
            form.add(entry.getKey(), file.getResource());
        }

        ResponseEntity<byte[]> upstream = restClientBuilder.build()
                .method(method)
                .uri(URI.create(target))
                .headers(h -> h.addAll(headers))
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
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
                    || lower.equals("authorization")) {
                continue;
            }
            Enumeration<String> values = request.getHeaders(name);
            while (values.hasMoreElements()) {
                headers.add(name, values.nextElement());
            }
        }
        headers.setAccept(List.of(MediaType.ALL));
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
