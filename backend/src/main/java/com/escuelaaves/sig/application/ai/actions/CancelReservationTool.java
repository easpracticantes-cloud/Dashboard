package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.service.SigOpsService;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CancelReservationTool implements AiActionTool {

    private final SigOpsService sigOpsService;

    @Override
    public ActionToolType type() {
        return ActionToolType.CANCEL_RESERVATION;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID id = ActionArgs.requireUuid(action.args(), "reservationId");
            String reason = ActionArgs.str(action.args(), "reason");
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true,
                        "Simulación: cancelar reserva " + id, Map.of("reservationId", id.toString()));
            }
            ReservationDto dto = sigOpsService.cancelReservation(id, reason);
            return ActionStepResult.ok(type().name(), false,
                    "Reserva cancelada: " + dto.code(),
                    Map.of("reservationId", dto.id().toString(), "status", dto.status().name()));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
