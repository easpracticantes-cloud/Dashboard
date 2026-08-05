package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "rule_conditions", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RuleConditionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rule_id", nullable = false)
    private BusinessRuleEntity rule;

    @Column(nullable = false, length = 80)
    private String field;

    @Column(nullable = false, length = 40)
    private String operator;

    @Column(name = "value_json", nullable = false, columnDefinition = "TEXT")
    private String valueJson;
}
