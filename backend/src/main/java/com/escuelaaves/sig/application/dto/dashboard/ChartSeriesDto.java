package com.escuelaaves.sig.application.dto.dashboard;

import java.util.List;

public record ChartSeriesDto(
        String name,
        List<String> labels,
        List<Long> values
) {
}
