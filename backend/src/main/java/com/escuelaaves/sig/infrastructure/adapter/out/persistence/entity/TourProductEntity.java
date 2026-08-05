package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * Catálogo de tours y tarifas (fuente de verdad de precios para cotizaciones IA).
 */
@Entity
@Table(name = "tour_products", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TourProductEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code", nullable = false, unique = true, length = 40)
    private String code;

    @Column(name = "name", nullable = false, length = 180)
    private String name;

    @Column(name = "price_per_person", nullable = false, precision = 14, scale = 2)
    private BigDecimal pricePerPerson;

    @Column(name = "transport_per_person", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal transportPerPerson = BigDecimal.ZERO;

    @Column(name = "restaurant_per_person", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal restaurantPerPerson = BigDecimal.ZERO;

    @Column(name = "currency", nullable = false, length = 3)
    @Builder.Default
    private String currency = "COP";

    @Column(name = "keywords", length = 500)
    private String keywords;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;
}
