package com.escuelaaves.sig.application.dto.setting;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record SettingUpdateRequest(
        @NotEmpty(message = "Debe incluir al menos una configuracion") List<Item> settings
) {
    public record Item(
            @NotBlank String key,
            String value
    ) {
    }
}
