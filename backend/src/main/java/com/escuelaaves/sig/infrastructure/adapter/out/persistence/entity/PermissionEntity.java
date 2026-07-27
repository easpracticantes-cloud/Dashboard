package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import com.escuelaaves.sig.domain.model.ModuleCode;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "permissions", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PermissionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "module", nullable = false, unique = true, length = 30)
    private ModuleCode module;

    @Column(name = "description", length = 200)
    private String description;
}
