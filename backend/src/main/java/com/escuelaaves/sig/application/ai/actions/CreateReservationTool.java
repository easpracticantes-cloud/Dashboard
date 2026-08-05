package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.commercial.ReservationCreateRequest;
import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.service.CommercialService;
import com.escuelaaves.sig.application.service.SigOpsService;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CreateReservationTool implements AiActionTool {

    private final CommercialService commercialService;

    @Override
    public ActionToolType type() {
        return ActionToolType.CREATE_RESERVATION;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID clientId = ActionArgs.requireUuid(action.args(), "clientId");
            String experience = ActionArgs.requireStr(action.args(), "experienceName");
            int partySize = ActionArgs.intVal(action.args(), "partySize", 1);
            LocalDate date = ActionArgs.date(action.args(), "reservationDate");
            if (date == null) {
                date = LocalDate.now().plusDays(7);
            }
            BigDecimal amount = ActionArgs.decimal(action.args(), "amount");
            if (amount == null) {
                amount = BigDecimal.ZERO;
            }
            String notes = ActionArgs.str(action.args(), "notes");
            if (dryRun) {
                return ActionStepResult.ok(type().name(), true,
                        "Simulación: crear reserva " + experience + " para " + partySize + " pax",
                        Map.of("clientId", clientId.toString(), "experienceName", experience,
                                "partySize", partySize, "reservationDate", date.toString(), "amount", amount));
            }
            ReservationDto dto = commercialService.createReservation(new ReservationCreateRequest(
                    clientId, null, null, experience, partySize, date, amount, CommercialStatus.CONFIRMED, notes
            ));
            return ActionStepResult.ok(type().name(), false,
                    "Reserva creada: " + dto.code(),
                    Map.of("reservationId", dto.id().toString(), "code", dto.code()));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
