package com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity;

import com.escuelaaves.sig.domain.model.SettingCategory;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "system_settings", schema = "sig")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemSettingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "setting_key", nullable = false, unique = true, length = 100)
    private String settingKey;

    @Column(name = "setting_value", columnDefinition = "TEXT")
    private String settingValue;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 30)
    @Builder.Default
    private SettingCategory category = SettingCategory.GENERAL;
}
