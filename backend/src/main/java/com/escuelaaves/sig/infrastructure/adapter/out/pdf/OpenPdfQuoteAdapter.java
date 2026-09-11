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

            Paragraph header = new Paragraph("escuelaaves Salento", brand);
            header.setSpacingAfter(2f);
            document.add(header);
            Paragraph sub = new Paragraph("Naturaleza que inspira · Descubre, observa, protege", tagline);
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
            addMeta(meta, label, value, "EMPRESA", "ESCUELA AVES SALENTO S.A.S.");
            addMeta(meta, label, value, "FECHA DE EMISIÓN", issued.format(DATE_FMT));
            addMeta(meta, label, value, "NIT", "901.814.243-5");
            addMeta(meta, label, value, "VÁLIDA HASTA",
                    quote.getValidUntil() != null ? quote.getValidUntil().format(DATE_FMT) : "15 días");
            addMeta(meta, label, value, "ASESOR", advisorName(quote));
            meta.setSpacingAfter(14f);
            document.add(meta);

            Paragraph detailTitle = new Paragraph("Detalle de la cotización", h1);
            detailTitle.setSpacingAfter(8f);
            document.add(detailTitle);

            PdfPTable items = new PdfPTable(5);
            items.setWidthPercentage(100);
            items.setWidths(new float[]{0.7f, 3.1f, 1f, 1.3f, 1.3f});
            addHeaderCell(items, "Ítem");
            addHeaderCell(items, "Descripción");
            addHeaderCell(items, "Cantidad");
            addHeaderCell(items, "Valor unitario");
            addHeaderCell(items, "Valor total");
            addBodyCell(items, value, "1");
            addBodyCell(items, value, safe(quote.getTitle()));
            addBodyCell(items, value, "1");
            addBodyCell(items, value, formatMoney(quote.getAmount(), quote.getCurrency()));
            addBodyCell(items, value, formatMoney(quote.getAmount(), quote.getCurrency()));
            items.setSpacingAfter(10f);
            document.add(items);

            if (quote.getDescription() != null && !quote.getDescription().isBlank()) {
                Paragraph desc = new Paragraph(quote.getDescription(), body);
                desc.setSpacingAfter(12f);
                document.add(desc);
            }

            BigDecimal totalAmount = quote.getAmount() != null ? quote.getAmount() : BigDecimal.ZERO;
            BigDecimal subtotal = totalAmount.divide(new BigDecimal("1.19"), 0, java.math.RoundingMode.HALF_UP);
            BigDecimal iva = totalAmount.subtract(subtotal);

            PdfPTable totals = new PdfPTable(2);
            totals.setWidthPercentage(46);
            totals.setHorizontalAlignment(Element.ALIGN_RIGHT);
            addTotalRow(totals, label, value, "Subtotal", formatMoney(subtotal, quote.getCurrency()));
            addTotalRow(totals, label, value, "IVA (19%)", formatMoney(iva, quote.getCurrency()));
            addTotalRow(totals, label, total, "Total", formatMoney(totalAmount, quote.getCurrency()));
            totals.setSpacingAfter(16f);
            document.add(totals);

            Paragraph pay = new Paragraph(
                    "Condiciones y forma de pago\n"
                            + "Forma de pago: 50% a la reserva y 50% el día del tour. "
                            + "Transferencia bancaria, Nequi o Daviplata. "
                            + "Cancelación: mínimo 48 horas de anticipación. "
                            + "Por condiciones climáticas se reprograma; no se reembolsa el valor.",
                    body);
            pay.setSpacingAfter(10f);
            document.add(pay);

            Paragraph contact = new Paragraph(
                    "ESCUELA AVES SALENTO S.A.S. · NIT 901.814.243-5 · Cra. 13 #22-10, Ed. Bariloche, Local 27 · "
                            + "Salento, Quindío · 310 833 7003 · escuelaavescontabilidad@gmail.com",
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

    private void addHeaderCell(PdfPTable table, String text) {
        Font font = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, Color.WHITE);
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(FOREST);
        cell.setBorder(0);
        cell.setPadding(6f);
        table.addCell(cell);
    }

    private void addBodyCell(PdfPTable table, Font font, String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text == null || text.isBlank() ? " " : text, font));
        cell.setBackgroundColor(MIST);
        cell.setBorder(0);
        cell.setPadding(7f);
        table.addCell(cell);
    }

    private void addTotalRow(PdfPTable table, Font label, Font value, String key, String val) {
        PdfPCell left = new PdfPCell(new Phrase(key, label));
        left.setBorder(0);
        left.setPadding(5f);
        table.addCell(left);
        PdfPCell right = new PdfPCell(new Phrase(val, value));
        right.setBorder(0);
        right.setHorizontalAlignment(Element.ALIGN_RIGHT);
        right.setPadding(5f);
        table.addCell(right);
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
