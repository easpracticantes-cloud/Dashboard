package com.escuelaaves.sig.application.dto.dashboard;

import java.util.List;

public record AnalyticsDto(
        List<ChartSeriesDto> series,
        List<KpiDto> summary
) {
}
