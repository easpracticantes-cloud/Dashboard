package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "rule_actions", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RuleActionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rule_id", nullable = false)
    private BusinessRuleEntity rule;

    @Column(name = "action_type", nullable = false, length = 80)
    private String actionType;

    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String payloadJson = "{}";
}
