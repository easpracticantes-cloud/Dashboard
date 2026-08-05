package com.escuelaaves.sig.domain.rules.port;

import com.escuelaaves.sig.domain.rules.model.BusinessRule;
import com.escuelaaves.sig.domain.rules.model.RuleContext;
import com.escuelaaves.sig.domain.rules.model.RuleResult;

import java.util.List;

public interface RuleEnginePort {

    RuleResult evaluate(RuleContext context);

    RuleResult simulate(RuleContext context);

    List<BusinessRule> listActiveRules(String tourCode);
}
