package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.setting.SettingDto;
import com.escuelaaves.sig.application.dto.setting.SettingUpdateRequest;

import java.util.List;

public interface SettingsUseCase {

    List<SettingDto> getSettings();

    List<SettingDto> updateSettings(SettingUpdateRequest request);
}
