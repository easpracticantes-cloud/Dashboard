package com.escuelaaves.sig.application.rules;

import com.escuelaaves.sig.domain.rules.model.RuleContext;
import com.escuelaaves.sig.domain.rules.model.RuleResult;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.BusinessRuleEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RuleActionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RuleConditionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.BusinessRuleJpaRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RuleEngineServiceTest {

    @Mock
    private BusinessRuleJpaRepository repository;

    private RuleEngineService service;

    @BeforeEach
    void setUp() {
        service = new RuleEngineService(repository, new ObjectMapper());
    }

    @Test
    @DisplayName("evaluate aplica jeep privado cuando people > 4")
    void evaluate_privateJeepWhenGt4() {
        BusinessRuleEntity rule = BusinessRuleEntity.builder()
                .id(1L)
                .code("JEEP_PRIVATE_GT4")
                .name("Jeep privado")
                .priority(80)
                .active(true)
                .description("Grupos >4")
                .conditions(List.of(RuleConditionEntity.builder()
                        .field("people")
                        .operator("GT")
                        .valueJson("4")
                        .build()))
                .actions(List.of(RuleActionEntity.builder()
                        .actionType("SET_TRANSPORT_MODE")
                        .payloadJson("{\"mode\":\"PRIVATE_JEEP\",\"message\":\"Jeep privado\"}")
                        .build()))
                .build();
        when(repository.findActiveForTour(anyString())).thenReturn(List.of(rule));

        RuleResult result = service.evaluate(RuleContext.of("ACAIME", 5, true, true));

        assertTrue(result.appliedRuleCodes().contains("JEEP_PRIVATE_GT4"));
        assertEquals("PRIVATE_JEEP", result.flags().get("transportMode"));
    }

    @Test
    @DisplayName("simulate marca mensajes con prefijo SIM")
    void simulate_prefixesMessages() {
        BusinessRuleEntity rule = BusinessRuleEntity.builder()
                .id(2L)
                .code("JEEP_PUBLIC_LTE4")
                .name("Jeep publico")
                .priority(70)
                .active(true)
                .description("Grupos <=4")
                .conditions(List.of(RuleConditionEntity.builder()
                        .field("people")
                        .operator("LTE")
                        .valueJson("4")
                        .build()))
                .actions(List.of())
                .build();
        when(repository.findActiveForTour(anyString())).thenReturn(List.of(rule));

        RuleResult result = service.simulate(RuleContext.of("ACAIME", 3, false, false));

        assertTrue(result.appliedRuleCodes().contains("JEEP_PUBLIC_LTE4"));
        assertTrue(result.messages().stream().anyMatch(m -> m.startsWith("[SIM]")));
    }

    @Test
    @DisplayName("evaluate sin reglas devuelve resultado vacio")
    void evaluate_empty() {
        when(repository.findActiveForTour(anyString())).thenReturn(List.of());
        RuleResult result = service.evaluate(RuleContext.of("CAFE", 2, false, false));
        assertTrue(result.appliedRuleCodes().isEmpty());
    }
}
