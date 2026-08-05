package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.service.SigOpsService;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.model.ClientSegment;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class FindOrCreateClientTool implements AiActionTool {

    private final SigOpsService sigOpsService;

    @Override
    public ActionToolType type() {
        return ActionToolType.FIND_OR_CREATE_CLIENT;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            String phone = ActionArgs.requireStr(action.args(), "phone");
            String name = ActionArgs.str(action.args(), "name");
            ClientSegment segment = parseSegment(ActionArgs.str(action.args(), "segment"));
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true,
                        "Simulación: findOrCreate cliente phone=" + phone,
                        Map.of("phone", phone, "name", name != null ? name : ""));
            }
            ClientDto client = sigOpsService.findOrCreateClientByPhone(phone, name, segment);
            return ActionStepResult.ok(type().name(), false,
                    "Cliente listo: " + client.name(),
                    Map.of("clientId", client.id().toString(), "name", client.name(),
                            "phone", client.phone() != null ? client.phone() : ""));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }

    private static ClientSegment parseSegment(String raw) {
        if (raw == null) {
            return ClientSegment.NUEVO;
        }
        try {
            return ClientSegment.valueOf(raw.trim().toUpperCase());
        } catch (Exception ex) {
            return ClientSegment.NUEVO;
        }
    }
}
