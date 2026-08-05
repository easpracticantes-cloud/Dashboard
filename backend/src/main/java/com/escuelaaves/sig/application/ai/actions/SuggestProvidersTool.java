package com.escuelaaves.sig.application.ai.actions;

import com.escuelaaves.sig.domain.ai.model.ActionStepResult;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.out.AiActionTool;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class SuggestProvidersTool implements AiActionTool {

    private final RecommendationPort recommendationPort;

    @Override
    public ActionToolType type() {
        return ActionToolType.SUGGEST_PROVIDERS;
    }

    @Override
    public ActionStepResult execute(PlannedAction action, boolean dryRun) {
        try {
            String tour = ActionArgs.str(action.args(), "tourCode");
            String category = ActionArgs.str(action.args(), "category");
            List<RecommendationPort.ProviderRecommendation> list = recommendationPort.suggest(tour, category);
            List<String> names = list.stream().map(RecommendationPort.ProviderRecommendation::name).toList();
            return ActionStepResult.ok(type().name(), dryRun,
                    "Proveedores sugeridos: " + names.size(),
                    Map.of("providers", names));
        } catch (Exception ex) {
            return ActionStepResult.fail(type().name(), dryRun, ex.getMessage());
        }
    }
}
