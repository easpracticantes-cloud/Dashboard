package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.domain.ai.port.out.ChecklistPort;
import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class ResolveChecklistTool implements AiActionTool {

    private final ChecklistPort checklistPort;

    @Override
    public ActionToolType type() {
        return ActionToolType.RESOLVE_CHECKLIST;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            String tour = ActionArgs.requireStr(action.args(), "tourCode");
            ChecklistPort.Checklist c = checklistPort.resolve(tour);
            List<String> labels = c.items().stream().map(ChecklistPort.ChecklistItem::label).toList();
            return ActionStepResult.ok(type().name(), dryRun,
                    "Checklist " + c.title() + " (" + labels.size() + " items)",
                    Map.of("tourCode", c.tourCode(), "title", c.title(), "items", labels));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
