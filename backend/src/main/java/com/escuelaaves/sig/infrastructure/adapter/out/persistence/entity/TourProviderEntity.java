package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "tour_providers", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TourProviderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 80)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 80)
    private String category;

    @Column(name = "tour_code", length = 40)
    private String tourCode;

    @Column(length = 500)
    private String notes;

    @Column(nullable = false)
    @Builder.Default
    private int priority = 50;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
