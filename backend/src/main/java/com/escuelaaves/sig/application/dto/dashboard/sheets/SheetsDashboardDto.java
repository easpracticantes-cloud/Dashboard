package com.escuelaaves.sig.application.dto.dashboard.sheets;

import java.util.List;

public record SheetsDashboardDto(
        SheetsMetaDto meta,
        SheetsKpisDto kpis,
        List<NamedCountDto> porSemaforo,
        List<NamedCountDto> porCanal,
        List<NamedCountDto> porHoja,
        List<NamedCountDto> porMes,
        List<MonthlyPointDto> evolucionMensual,
        List<SeguimientoWhatsappDto> seguimientoWhatsapp,
        List<VentaDto> ventas,
        List<NamedCountDto> resumenPaises,
        List<PaisResumenDto> paisesDetalle,
        List<SheetSummaryDto> hojas,
        List<ToqueDto> toques,
        List<PiezaPubDto> piezasPub,
        List<B2bAgenciaDto> b2bAgencias,
        SheetTableDto b2bTabla,
        SheetTableDto estadisticas,
        SheetTableDto despliegueSemanal,
        SheetTableDto planComercial,
        List<RawSheetDto> rawSheets,
        String b2bStatus,
        String b2bMensaje,
        boolean success,
        String message
) {
}
