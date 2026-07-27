package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "role_permissions", schema = "sig",
        uniqueConstraints = @UniqueConstraint(columnNames = {"role_id", "permission_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RolePermissionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id", nullable = false)
    private RoleEntity role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "permission_id", nullable = false)
    private PermissionEntity permission;

    @Column(name = "can_read", nullable = false)
    @Builder.Default
    private boolean canRead = true;

    @Column(name = "can_write", nullable = false)
    @Builder.Default
    private boolean canWrite = false;
}
