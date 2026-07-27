package com.escuelaaves.sig.application.dto.setting;

import com.escuelaaves.sig.domain.model.SettingCategory;

public record SettingDto(
        String key,
        String value,
        SettingCategory category
) {
}
