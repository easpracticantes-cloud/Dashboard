package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.setting.SettingDto;
import com.escuelaaves.sig.application.dto.setting.SettingUpdateRequest;
import com.escuelaaves.sig.domain.port.in.SettingsUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/settings")
@RequiredArgsConstructor
@Tag(name = "Configuracion", description = "Configuracion general del sistema")
public class SettingsController {

    private final SettingsUseCase settingsUseCase;

    @GetMapping
    @Operation(summary = "Lista todas las configuraciones del sistema")
    public ResponseEntity<List<SettingDto>> getSettings() {
        return ResponseEntity.ok(settingsUseCase.getSettings());
    }

    @PutMapping
    @Operation(summary = "Actualiza una o mas configuraciones del sistema")
    public ResponseEntity<List<SettingDto>> updateSettings(@Valid @RequestBody SettingUpdateRequest request) {
        return ResponseEntity.ok(settingsUseCase.updateSettings(request));
    }
}
