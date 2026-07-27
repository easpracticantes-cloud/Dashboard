package com.escuelaaves.sig.infrastructure.adapter.out.pdf;

import com.escuelaaves.sig.domain.port.out.QuotePdfPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.QuoteEntity;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Genera un PDF con marca de Escuela Aves Salento para una cotización.
 */
@Slf4j
@Component
public class OpenPdfQuoteAdapter implements QuotePdfPort {

    private static final Color FOREST = new Color(15, 61, 46);
    private static final Color LEAF = new Color(31, 122, 76);
    private static final Color INK = new Color(31, 41, 38);
    private static final Color MIST = new Color(240, 246, 243);

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("dd 'de' MMMM 'de' yyyy", new Locale("es", "CO"));

    @Override
    public byte[] render(QuoteEntity quote) {
        Document document = new Document(PageSize.A4, 48, 48, 54, 54);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font brand = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 20, FOREST);
            Font tagline = FontFactory.getFont(FontFactory.HELVETICA, 10, LEAF);
            Font h1 = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 15, INK);
            Font label = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, new Color(110, 120, 116));
            Font value = FontFactory.getFont(FontFactory.HELVETICA, 11, INK);
            Font body = FontFactory.getFont(FontFactory.HELVETICA, 10.5f, INK);
            Font total = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, FOREST);
            Font footer = FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 8.5f, new Color(140, 150, 146));

            Paragraph header = new Paragraph("Escuela Aves Salento", brand);
            header.setSpacingAfter(2f);
            document.add(header);
            Paragraph sub = new Paragraph("Turismo de naturaleza · Avistamiento y experiencias", tagline);
            sub.setSpacingAfter(14f);
            document.add(sub);

            Paragraph title = new Paragraph("COTIZACIÓN", h1);
            title.setSpacingAfter(2f);
            document.add(title);
            Paragraph code = new Paragraph("N.º " + safe(quote.getCode()), value);
            code.setSpacingAfter(12f);
            document.add(code);

            PdfPTable meta = new PdfPTable(2);
            meta.setWidthPercentage(100);
            meta.getDefaultCell().setBorder(0);
            LocalDate issued = quote.getIssuedAt() != null
                    ? quote.getIssuedAt()
                    : (quote.getCreatedAt() != null
                    ? quote.getCreatedAt().atZone(ZoneId.of("America/Bogota")).toLocalDate()
                    : LocalDate.now());
            addMeta(meta, label, value, "CLIENTE", clientName(quote));
            addMeta(meta, label, value, "FECHA DE EMISIÓN", issued.format(DATE_FMT));
            addMeta(meta, label, value, "ASESOR", advisorName(quote));
            addMeta(meta, label, value, "VÁLIDA HASTA",
                    quote.getValidUntil() != null ? quote.getValidUntil().format(DATE_FMT) : "15 días");
            meta.setSpacingAfter(16f);
            document.add(meta);

            Paragraph detailTitle = new Paragraph(safe(quote.getTitle()), h1);
            detailTitle.setSpacingAfter(6f);
            document.add(detailTitle);

            if (quote.getDescription() != null && !quote.getDescription().isBlank()) {
                Paragraph desc = new Paragraph(quote.getDescription(), body);
                desc.setSpacingAfter(16f);
                document.add(desc);
            }

            PdfPTable totalTable = new PdfPTable(2);
            totalTable.setWidthPercentage(100);
            totalTable.setWidths(new float[]{3f, 2f});

            PdfPCell totalLabel = new PdfPCell(new Phrase("TOTAL ESTIMADO", label));
            totalLabel.setBackgroundColor(MIST);
            totalLabel.setBorder(0);
            totalLabel.setPadding(12f);
            totalLabel.setVerticalAlignment(Element.ALIGN_MIDDLE);
            totalTable.addCell(totalLabel);

            PdfPCell totalValue = new PdfPCell(new Phrase(formatMoney(quote.getAmount(), quote.getCurrency()), total));
            totalValue.setBackgroundColor(MIST);
            totalValue.setBorder(0);
            totalValue.setPadding(12f);
            totalValue.setHorizontalAlignment(Element.ALIGN_RIGHT);
            totalValue.setVerticalAlignment(Element.ALIGN_MIDDLE);
            totalTable.addCell(totalValue);
            totalTable.setSpacingAfter(20f);
            document.add(totalTable);

            Paragraph note = new Paragraph(
                    "Los valores son aproximados y están sujetos a disponibilidad y confirmación. "
                            + "Esta cotización fue preparada con apoyo del asistente de IA a partir de la conversación con el cliente.",
                    footer);
            note.setSpacingBefore(8f);
            document.add(note);

            Paragraph contact = new Paragraph(
                    "\nEscuela Aves Salento · Salento, Quindío · WhatsApp Business · escuelaavescomercial@gmail.com",
                    footer);
            document.add(contact);

            document.close();
            return out.toByteArray();
        } catch (Exception ex) {
            log.error("Fallo al generar PDF de la cotización {}: {}",
                    quote != null ? quote.getCode() : "?", ex.getMessage());
            throw new IllegalStateException("No se pudo generar el PDF de la cotización", ex);
        }
    }

    private void addMeta(PdfPTable table, Font label, Font value, String key, String val) {
        PdfPCell cell = new PdfPCell();
        cell.setBorder(0);
        cell.setPaddingBottom(8f);
        cell.addElement(new Paragraph(key, label));
        cell.addElement(new Paragraph(val, value));
        table.addCell(cell);
    }

    private String clientName(QuoteEntity quote) {
        return quote.getClient() != null && quote.getClient().getName() != null
                ? quote.getClient().getName() : "Cliente";
    }

    private String advisorName(QuoteEntity quote) {
        return quote.getAdvisor() != null && quote.getAdvisor().getFullName() != null
                ? quote.getAdvisor().getFullName() : "Equipo comercial";
    }

    private String formatMoney(BigDecimal amount, String currency) {
        BigDecimal value = amount != null ? amount : BigDecimal.ZERO;
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(Locale.US);
        symbols.setGroupingSeparator('.');
        DecimalFormat df = new DecimalFormat("#,##0", symbols);
        return "$ " + df.format(value) + " " + (currency != null ? currency : "COP");
    }

    private String safe(String value) {
        return value != null ? value : "";
    }
}
