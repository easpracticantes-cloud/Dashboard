package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.commercial.ReservationDto;
import com.escuelaaves.sig.application.service.SigOpsExtendedService;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ListClientReservationsTool implements AiActionTool {

    private final SigOpsExtendedService sigOpsExtendedService;

    @Override
    public ActionToolType type() {
        return ActionToolType.LIST_CLIENT_RESERVATIONS;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            UUID clientId = ActionArgs.requireUuid(action.args(), "clientId");
            List<ReservationDto> all = sigOpsExtendedService.listReservationsByClient(clientId);
            List<ReservationDto> found = all.stream().limit(8).toList();
            List<Map<String, Object>> hits = new ArrayList<>();
            StringBuilder msg = new StringBuilder();
            if (found.isEmpty()) {
                msg.append("No hay reservas para ese cliente.");
            } else if (found.size() == 1) {
                ReservationDto r = found.get(0);
                hits.add(hit(1, r));
                msg.append("Hay una reserva: ").append(label(r)).append(".");
            } else {
                msg.append("Tengo ").append(found.size()).append(" reservas. ¿Cuál quieres?");
                int i = 1;
                for (ReservationDto r : found) {
                    hits.add(hit(i, r));
                    msg.append("\n").append(i).append(". ").append(label(r));
                    i++;
                }
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("hits", hits);
            data.put("count", found.size());
            data.put("ambiguous", found.size() > 1);
            if (found.size() == 1) {
                data.put("reservationId", found.get(0).id().toString());
            }
            return ActionStepResult.ok(type().name(), dryRun, msg.toString(), data);
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }

    private static Map<String, Object> hit(int index, ReservationDto r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("index", index);
        m.put("id", r.id().toString());
        m.put("label", label(r));
        return m;
    }

    private static String label(ReservationDto r) {
        String exp = r.experienceName() != null ? r.experienceName() : "Reserva";
        String who = r.clientName() != null ? r.clientName() : "";
        String when = r.reservationDate() != null ? r.reservationDate().toString() : "";
        return (who + " · " + exp + " · " + when).replace(" ·  · ", " · ").trim();
    }
}
