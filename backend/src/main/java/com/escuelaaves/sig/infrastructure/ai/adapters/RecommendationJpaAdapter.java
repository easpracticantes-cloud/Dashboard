package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.TourProviderJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class RecommendationJpaAdapter implements RecommendationPort {

    private final TourProviderJpaRepository repository;

    @Override
    @Transactional(readOnly = true)
    public List<ProviderRecommendation> suggest(String tourCode, String category) {
        return repository.findRecommendations(tourCode, category).stream()
                .map(p -> new ProviderRecommendation(
                        p.getCode(),
                        p.getName(),
                        p.getCategory(),
                        p.getTourCode(),
                        p.getNotes(),
                        p.getPriority()
                ))
                .toList();
    }
}
