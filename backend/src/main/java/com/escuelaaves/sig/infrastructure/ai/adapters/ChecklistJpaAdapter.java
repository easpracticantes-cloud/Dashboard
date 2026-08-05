package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.port.out.ChecklistPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.TourChecklistEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.TourChecklistItemEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.TourChecklistJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@Component
@RequiredArgsConstructor
public class ChecklistJpaAdapter implements ChecklistPort {

    private final TourChecklistJpaRepository repository;

    @Override
    @Transactional(readOnly = true)
    public Checklist resolve(String tourCode) {
        if (tourCode == null || tourCode.isBlank()) {
            return new Checklist("", "Sin checklist", List.of());
        }
        TourChecklistEntity entity = repository.findFirstByTourCodeIgnoreCaseAndActiveTrue(tourCode.trim())
                .orElse(null);
        if (entity == null) {
            return new Checklist(tourCode.toUpperCase(), "Sin checklist configurada", List.of());
        }
        List<ChecklistItem> items = entity.getItems().stream()
                .sorted(Comparator.comparingInt(TourChecklistItemEntity::getSortOrder))
                .map(i -> new ChecklistItem(i.getCode(), i.getLabel(), i.getCategory(), i.isRequired(), i.getSortOrder()))
                .toList();
        return new Checklist(entity.getTourCode(), entity.getTitle(), items);
    }
}
