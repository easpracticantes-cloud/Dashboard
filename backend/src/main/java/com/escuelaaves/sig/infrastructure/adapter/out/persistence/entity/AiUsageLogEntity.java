package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "ai_usage_logs", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiUsageLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(length = 120)
    private String endpoint;

    @Column(nullable = false, length = 80)
    private String operation;

    @Column(nullable = false, length = 40)
    private String provider;

    @Column(length = 80)
    private String model;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "estimated_tokens")
    private Integer estimatedTokens;

    @Column(nullable = false)
    @Builder.Default
    private boolean success = true;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
