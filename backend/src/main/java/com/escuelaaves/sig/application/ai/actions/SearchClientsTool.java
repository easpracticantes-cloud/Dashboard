package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.service.SigOpsService;
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

/**
 * Lectura: busca clientes por nombre/teléfono. Siempre consulta el servicio (no inventa).
 */
@Component
@RequiredArgsConstructor
public class SearchClientsTool implements AiActionTool {

    private final SigOpsService sigOpsService;

    @Override
    public ActionToolType type() {
        return ActionToolType.SEARCH_CLIENTS;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            String query = ActionArgs.str(action.args(), "query");
            if (query == null) {
                query = ActionArgs.str(action.args(), "name");
            }
            if (query == null || query.isBlank()) {
                return ActionStepResult.fail(type().name(), dryRun, "Indica el nombre o teléfono a buscar.");
            }
            List<ClientDto> found = sigOpsService.searchClients(query).stream().limit(8).toList();
            List<Map<String, Object>> hits = new ArrayList<>();
            int i = 1;
            StringBuilder msg = new StringBuilder();
            if (found.isEmpty()) {
                msg.append("No encontré clientes que coincidan con \"").append(query).append("\".");
            } else if (found.size() == 1) {
                ClientDto c = found.get(0);
                hits.add(hit(1, c));
                msg.append("Encontré a ").append(c.name());
                if (c.phone() != null && !c.phone().isBlank()) {
                    msg.append(" (").append(c.phone()).append(")");
                }
                msg.append(".");
            } else {
                msg.append("Tengo ").append(found.size()).append(" coincidencias. ¿Cuál quieres?");
                for (ClientDto c : found) {
                    hits.add(hit(i, c));
                    msg.append("\n").append(i).append(". ").append(c.name());
                    if (c.phone() != null && !c.phone().isBlank()) {
                        msg.append(" · ").append(c.phone());
                    }
                    i++;
                }
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("hits", hits);
            data.put("count", found.size());
            data.put("ambiguous", found.size() > 1);
            if (found.size() == 1) {
                data.put("clientId", found.get(0).id().toString());
            }
            return ActionStepResult.ok(type().name(), dryRun, msg.toString(), data);
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }

    private static Map<String, Object> hit(int index, ClientDto c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("index", index);
        m.put("id", c.id().toString());
        m.put("label", c.name() != null ? c.name() : "");
        m.put("phone", c.phone() != null ? c.phone() : "");
        return m;
    }
}
