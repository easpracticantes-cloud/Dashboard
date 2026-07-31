package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.dashboard.AnalyticsDto;
import com.escuelaaves.sig.application.dto.dashboard.AnalyticsFilter;
import com.escuelaaves.sig.application.dto.dashboard.DashboardOverviewDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetsDashboardDto;
import com.escuelaaves.sig.application.service.SheetsSyncService;
import com.escuelaaves.sig.domain.port.in.DashboardUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@Tag(name = "Dashboard", description = "KPIs y analiticas del panel principal")
public class DashboardController {

    private final DashboardUseCase dashboardUseCase;
    private final SheetsSyncService sheetsSyncService;

    @GetMapping("/overview")
    @Operation(summary = "Obtiene los KPIs principales y las conversaciones recientes")
    public ResponseEntity<DashboardOverviewDto> overview(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String importance,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        AnalyticsFilter filter = new AnalyticsFilter(year, month, importance, status, category, name, phone, from, to);
        return ResponseEntity.ok(dashboardUseCase.getOverview(filter));
    }

    @GetMapping("/analytics")
    @Operation(summary = "Obtiene series de datos para graficas de analitica con filtros dinamicos")
    public ResponseEntity<AnalyticsDto> analytics(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(required = false) String importance,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String phone,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        AnalyticsFilter filter = new AnalyticsFilter(year, month, importance, status, category, name, phone, from, to);
        return ResponseEntity.ok(dashboardUseCase.getAnalytics(filter));
    }

    @GetMapping("/sheets")
    @Operation(summary = "Dashboard Sheets desde caché/PostgreSQL. mode=summary → KPIs/agregados (first paint); includeRaw → matrices.")
    public ResponseEntity<SheetsDashboardDto> sheets(
            @RequestParam(defaultValue = "false") boolean refresh,
            @RequestParam(defaultValue = "false") boolean includeRaw,
            @RequestParam(defaultValue = "false") boolean summary
    ) {
        return ResponseEntity.ok(sheetsSyncService.getDashboardSheets(refresh, includeRaw, summary));
    }
}
