package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import com.escuelaaves.sig.domain.model.ClientSegment;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "clients", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClientEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "segment", nullable = false, length = 20)
    @Builder.Default
    private ClientSegment segment = ClientSegment.NUEVO;

    @Column(name = "source", length = 60)
    private String source;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_user_id")
    private UserEntity assignedUser;

    @ElementCollection
    @CollectionTable(name = "client_tags", schema = "sig", joinColumns = @JoinColumn(name = "client_id"))
    @Column(name = "tag", length = 60)
    @Builder.Default
    private Set<String> tags = new HashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_contact_at")
    private Instant lastContactAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
