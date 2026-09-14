package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "intelligent_quotes", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IntelligentQuoteEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "quote_code", length = 40)
    private String quoteCode;

    @Column(name = "commercial_quote_id")
    private UUID commercialQuoteId;

    @Column(name = "client_id")
    private UUID clientId;

    @Column(name = "client_name")
    private String clientName;

    @Column(length = 16)
    private String confidence;

    @Column(columnDefinition = "TEXT")
    private String instructions;

    @Column(name = "extraction_json", columnDefinition = "TEXT")
    private String extractionJson;

    @Column(name = "draft_json", nullable = false, columnDefinition = "TEXT")
    private String draftJson;

    @Column(name = "missing_json", columnDefinition = "TEXT")
    private String missingJson;

    @Column(name = "warnings_json", columnDefinition = "TEXT")
    private String warningsJson;

    @Column(name = "trace_json", columnDefinition = "TEXT")
    private String traceJson;

    @Column(name = "created_by", length = 128)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (status == null) {
            status = "PREVIEW";
        }
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
