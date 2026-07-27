package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.report.ReportSummaryDto;

public interface ReportUseCase {

    ReportSummaryDto getConversationsReport();

    byte[] exportConversationsCsv();

    byte[] exportConversationsPdf();
}
