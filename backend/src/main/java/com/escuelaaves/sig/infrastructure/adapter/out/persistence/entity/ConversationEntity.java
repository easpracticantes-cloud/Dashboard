package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import com.escuelaaves.sig.domain.model.ChannelType;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.ConversationStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "conversations", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConversationEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private ClientEntity client;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private ConversationStatus status = ConversationStatus.OPEN;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 20)
    @Builder.Default
    private ConversationPriority priority = ConversationPriority.MEDIUM;

    @Column(name = "importance", nullable = false)
    @Builder.Default
    private int importance = 3;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_user_id")
    private UserEntity assignedUser;

    @Column(name = "unread_count", nullable = false)
    @Builder.Default
    private int unreadCount = 0;

    @Column(name = "last_message_preview", length = 500)
    private String lastMessagePreview;

    @Column(name = "last_message_at")
    private Instant lastMessageAt;

    @ElementCollection
    @CollectionTable(name = "conversation_labels", schema = "sig", joinColumns = @JoinColumn(name = "conversation_id"))
    @Column(name = "label", length = 60)
    @Builder.Default
    private Set<String> labels = new HashSet<>();

    @Column(name = "category", length = 80)
    private String category;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 20)
    @Builder.Default
    private ChannelType channel = ChannelType.WHATSAPP;

    @Column(name = "external_key", length = 80, unique = true)
    private String externalKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
