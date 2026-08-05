package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.port.out.integration.GoogleDrivePort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class StubCreateDriveFolderTool implements AiActionTool {

    private final GoogleDrivePort googleDrivePort;

    @Override
    public ActionToolType type() {
        return ActionToolType.STUB_CREATE_DRIVE_FOLDER;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            String folderName = ActionArgs.requireStr(action.args(), "folderName");
            String marker = "SIG carpeta operativa: " + folderName;
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true,
                        "Simulación: carpeta Drive '" + folderName + "' (stub hasta conectar Drive)",
                        Map.of("folderName", folderName, "driveStatus", googleDrivePort.status().name()));
            }
            String uri = googleDrivePort.uploadFile(folderName + "/README.txt",
                    marker.getBytes(StandardCharsets.UTF_8));
            return ActionStepResult.ok(type().name(), false,
                    "Drive stub: " + uri,
                    Map.of("uri", uri, "folderName", folderName, "status", googleDrivePort.status().name()));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
