package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

public interface ChecklistPort {

    Checklist resolve(String tourCode);

    record Checklist(String tourCode, String title, List<ChecklistItem> items) {
    }

    record ChecklistItem(String code, String label, String category, boolean required, int sortOrder) {
    }
}
