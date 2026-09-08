package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.client.ClientUpdateRequest;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.port.in.ClientUseCase;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class UpdateClientTool implements AiActionTool {

    private final ClientUseCase clientUseCase;

    @Override
    public ActionToolType type() {
        return ActionToolType.UPDATE_CLIENT;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID id = ActionArgs.requireUuid(action.args(), "clientId");
            String phone = ActionArgs.str(action.args(), "phone");
            String name = ActionArgs.str(action.args(), "name");
            String email = ActionArgs.str(action.args(), "email");
            if (phone == null && name == null && email == null) {
                return ActionStepResult.fail(type().name(), dryRun, "Indica qué campo actualizar (teléfono, nombre o correo).");
            }
            if (dryRun) {
                StringBuilder sim = new StringBuilder("Esto actualizará al cliente");
                if (phone != null) {
                    sim.append(" el teléfono a ").append(phone);
                }
                if (name != null) {
                    sim.append(" el nombre a ").append(name);
                }
                if (email != null) {
                    sim.append(" el correo a ").append(email);
                }
                sim.append(".");
                return ActionStepResult.ok(type().name(), true, sim.toString(),
                        Map.of("clientId", id.toString()));
            }
            ClientDto dto = clientUseCase.updateClient(id, new ClientUpdateRequest(
                    name, phone, email, null, null, null, null, null, null
            ));
            return ActionStepResult.ok(type().name(), false,
                    "Cliente actualizado: " + dto.name(),
                    Map.of("clientId", dto.id().toString(), "name", dto.name() != null ? dto.name() : "",
                            "phone", dto.phone() != null ? dto.phone() : ""));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
