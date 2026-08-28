package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.integration.SheetRowWriteRequest;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteResultDto;
import com.escuelaaves.sig.domain.port.out.integration.GoogleSheetsPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Escritura SIG → Google Sheets y parche del cache del dashboard.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SheetsWriteService {

    private final GoogleSheetsPort googleSheetsPort;
    private final SheetsSyncService sheetsSyncService;

    public SheetRowWriteResultDto write(SheetRowWriteRequest request) {
        if (request == null || blank(request.sheetName()) || blank(request.action())) {
            throw new BadRequestException("action y sheetName son obligatorios");
        }
        if (request.fields() == null || request.fields().isEmpty()) {
            throw new BadRequestException("fields no puede estar vacío");
        }

        String action = request.action().trim().toLowerCase(Locale.ROOT).replace("_", "");
        if (!List.of("updaterow", "appendrow").contains(action)) {
            throw new BadRequestException("action debe ser updateRow o appendRow");
        }

        SheetRowWriteRequest normalized = new SheetRowWriteRequest(
                action,
                request.sheetName().trim(),
                request.match() == null ? Map.of() : request.match(),
                request.fields()
        );

        SheetRowWriteResultDto result = googleSheetsPort.writeRow(normalized);
        if (!result.success()) {
            throw new BadRequestException(
                    result.message() != null ? result.message() : "No se pudo escribir en Google Sheets"
            );
        }
        return result;
    }

    public SheetRowWriteResultDto updateSeguimiento(Map<String, Object> body) {
        String sheetName = str(body.get("hojaOrigen"));
        if (blank(sheetName)) {
            throw new BadRequestException("hojaOrigen es obligatorio");
        }
        String celular = str(body.get("celular"));
        String fecha = str(body.get("fecha"));
        if (blank(celular) && blank(fecha)) {
            throw new BadRequestException("celular o fecha son obligatorios para localizar la fila");
        }

        Map<String, String> match = new LinkedHashMap<>();
        if (!blank(celular)) match.put("celular", celular);
        if (!blank(fecha)) match.put("fecha", fecha.length() >= 10 ? fecha.substring(0, 10) : fecha);
        if (!blank(str(body.get("cliente")))) match.put("cliente", str(body.get("cliente")));

        Map<String, Object> fields = new LinkedHashMap<>();
        putIfPresent(fields, "CLIENTE", body.get("cliente"));
        putIfPresent(fields, "CELULAR", body.get("celular"));
        putIfPresent(fields, "CANAL", body.get("canal"));
        putIfPresent(fields, "TIPO", body.get("tipo"));
        putIfPresent(fields, "SEMAFORO", body.get("semaforo"));
        putIfPresent(fields, "SOLICITUD", body.get("solicitud"));
        putIfPresent(fields, "RESPUESTA", body.get("respuesta"));
        putIfPresent(fields, "NOTAS", body.get("notas"));
        putIfPresent(fields, "ASIGNADO", body.get("asignado"));
        putIfPresent(fields, "PROXIMO SEGUIMIENTO", body.get("proximoSeguimiento"));
        putIfPresent(fields, "FECHA SERVICIO", body.get("fechaServicio"));
        putIfPresent(fields, "DISC", body.get("disc"));
        putIfPresent(fields, "PRIORIZAR", body.get("priorizar"));
        putIfPresent(fields, "PENDIENTE", body.get("pendiente"));
        putIfPresent(fields, "OBJECION", body.get("objecion"));
        if (body.containsKey("cotizado")) {
            fields.put("COTIZADO", boolLabel(body.get("cotizado")));
        }
        if (body.containsKey("encuesta")) {
            fields.put("ENCUESTA", boolLabel(body.get("encuesta")));
        }
        if (body.containsKey("monto") && body.get("monto") != null) {
            fields.put("MONTO", body.get("monto"));
        }

        SheetRowWriteResultDto result = write(new SheetRowWriteRequest("updaterow", sheetName, match, fields));
        patchSeguimientoCache(body);
        return result;
    }

    public SheetRowWriteResultDto updateVenta(Map<String, Object> body) {
        String sheetName = str(body.get("hojaOrigen"));
        if (blank(sheetName)) {
            sheetName = "VENTAS";
        }
        String celular = str(body.get("celular"));
        String fecha = str(body.get("fechaCot"));
        if (blank(celular) && blank(fecha) && blank(str(body.get("nombre")))) {
            throw new BadRequestException("celular, fechaCot o nombre requeridos");
        }

        Map<String, String> match = new LinkedHashMap<>();
        if (!blank(celular)) match.put("celular", celular);
        if (!blank(fecha)) match.put("fecha", fecha.length() >= 10 ? fecha.substring(0, 10) : fecha);
        if (!blank(str(body.get("nombre")))) match.put("cliente", str(body.get("nombre")));

        Map<String, Object> fields = new LinkedHashMap<>();
        putIfPresent(fields, "NOMBRE", body.get("nombre"));
        putIfPresent(fields, "CELULAR", body.get("celular"));
        putIfPresent(fields, "TIPO CLIENTE", body.get("tipoCliente"));
        putIfPresent(fields, "SERVICIO", body.get("servicio"));
        putIfPresent(fields, "VENTA", body.get("venta"));
        putIfPresent(fields, "CODIGO", body.get("codigo"));
        putIfPresent(fields, "FECHA SERVICIO", body.get("fechaServicio"));
        putIfPresent(fields, "REALIZADO", body.get("realizado"));
        putIfPresent(fields, "ENVIO RESERVA", body.get("envioReserva"));
        putIfPresent(fields, "PAGO AUTOBITS", body.get("pagoAutobits"));
        putIfPresent(fields, "SOPORTE DRIVE", body.get("soporteDrive"));
        putIfPresent(fields, "FECHA COT", body.get("fechaCot"));

        SheetRowWriteResultDto result = write(new SheetRowWriteRequest("updaterow", sheetName, match, fields));
        patchVentaCache(body);
        return result;
    }

    private void patchSeguimientoCache(Map<String, Object> body) {
        try {
            sheetsSyncService.patchSeguimientoRow(
                    str(body.get("hojaOrigen")),
                    str(body.get("celular")),
                    str(body.get("fecha")),
                    body
            );
        } catch (Exception ex) {
            log.warn("[SheetsWrite] No se pudo parchear cache seguimiento: {}", ex.getMessage());
        }
    }

    private void patchVentaCache(Map<String, Object> body) {
        try {
            sheetsSyncService.patchVentaRow(
                    str(body.get("hojaOrigen")),
                    str(body.get("celular")),
                    str(body.get("fechaCot")),
                    body
            );
        } catch (Exception ex) {
            log.warn("[SheetsWrite] No se pudo parchear cache venta: {}", ex.getMessage());
        }
    }

    private static void putIfPresent(Map<String, Object> fields, String key, Object value) {
        if (value == null) return;
        String s = String.valueOf(value).trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return;
        fields.put(key, value instanceof Boolean ? boolLabel(value) : value);
    }

    private static String boolLabel(Object value) {
        if (value instanceof Boolean b) {
            return b ? "SI" : "NO";
        }
        String s = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        if (s.equals("true") || s.equals("si") || s.equals("sí") || s.equals("1") || s.equals("yes")) {
            return "SI";
        }
        return "NO";
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
