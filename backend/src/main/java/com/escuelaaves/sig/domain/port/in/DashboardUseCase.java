package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.dashboard.AnalyticsDto;
import com.escuelaaves.sig.application.dto.dashboard.AnalyticsFilter;
import com.escuelaaves.sig.application.dto.dashboard.DashboardOverviewDto;

public interface DashboardUseCase {

    DashboardOverviewDto getOverview();

    DashboardOverviewDto getOverview(AnalyticsFilter filter);

    AnalyticsDto getAnalytics();

    AnalyticsDto getAnalytics(AnalyticsFilter filter);
}
