package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "whatsapp_import_audits", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WhatsAppImportAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 255)
    private String filename;

    @Column(name = "file_hash", length = 64)
    private String fileHash;

    @Column(name = "source_kind", nullable = false, length = 16)
    private String sourceKind;

    @Column(name = "message_count")
    private Integer messageCount;

    @Column(length = 80)
    private String model;

    @Column(name = "extracted_json", columnDefinition = "TEXT")
    private String extractedJson;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "PREVIEW";

    @Column(name = "confirmed_by", length = 128)
    private String confirmedBy;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
