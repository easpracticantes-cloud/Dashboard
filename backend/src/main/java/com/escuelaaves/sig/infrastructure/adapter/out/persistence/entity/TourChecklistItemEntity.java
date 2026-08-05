package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tour_checklist_items", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TourChecklistItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checklist_id", nullable = false)
    private TourChecklistEntity checklist;

    @Column(nullable = false, length = 80)
    private String code;

    @Column(nullable = false, length = 300)
    private String label;

    @Column(nullable = false, length = 80)
    @Builder.Default
    private String category = "OPS";

    @Column(nullable = false)
    @Builder.Default
    private boolean required = true;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
