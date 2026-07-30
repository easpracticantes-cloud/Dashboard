package com.escuelaaves.sig;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.net.URI;

/**
 * Punto de entrada del backend SIG (Sistema Inteligente de Gestion) para
 * Escuela Aves Salento.
 */
@SpringBootApplication
@EnableScheduling
public class SigApplication {

    public static void main(String[] args) {
        normalizeRenderDatabaseUrl();
        SpringApplication.run(SigApplication.class, args);
    }

    /**
     * Render / proveedores cloud suelen entregar {@code postgres://user:pass@host/db}.
     * El driver JDBC de PostgreSQL requiere {@code jdbc:postgresql://host/db} y
     * credenciales separadas.
     */
    static void normalizeRenderDatabaseUrl() {
        String raw = firstNonBlank(System.getenv("DB_URL"), System.getProperty("DB_URL"));
        if (raw == null || raw.isBlank()) {
            return;
        }

        String trimmed = raw.trim();
        if (trimmed.startsWith("jdbc:postgresql://")) {
            return;
        }

        if (!trimmed.startsWith("postgres://") && !trimmed.startsWith("postgresql://")) {
            return;
        }

        try {
            String withScheme = trimmed.startsWith("postgres://")
                    ? "postgresql://" + trimmed.substring("postgres://".length())
                    : trimmed;
            URI uri = URI.create(withScheme);
            String host = uri.getHost();
            int port = uri.getPort() > 0 ? uri.getPort() : 5432;
            String path = uri.getPath() == null ? "" : uri.getPath();
            String database = path.startsWith("/") ? path.substring(1) : path;
            String query = uri.getQuery();

            StringBuilder jdbc = new StringBuilder("jdbc:postgresql://")
                    .append(host)
                    .append(':')
                    .append(port)
                    .append('/')
                    .append(database);
            if (query != null && !query.isBlank()) {
                jdbc.append('?').append(query);
            }

            System.setProperty("DB_URL", jdbc.toString());
            System.setProperty("spring.datasource.url", jdbc.toString());

            String userInfo = uri.getUserInfo();
            if (userInfo != null && !userInfo.isBlank()) {
                String[] parts = userInfo.split(":", 2);
                if (parts.length >= 1 && isBlank(System.getenv("DB_USER"))) {
                    System.setProperty("DB_USER", parts[0]);
                    System.setProperty("spring.datasource.username", parts[0]);
                }
                if (parts.length == 2 && isBlank(System.getenv("DB_PASSWORD"))) {
                    System.setProperty("DB_PASSWORD", parts[1]);
                    System.setProperty("spring.datasource.password", parts[1]);
                }
            }
        } catch (Exception ex) {
            System.err.println("[SIG] No se pudo normalizar DB_URL: " + ex.getMessage());
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        if (b != null && !b.isBlank()) {
            return b;
        }
        return null;
    }
}
