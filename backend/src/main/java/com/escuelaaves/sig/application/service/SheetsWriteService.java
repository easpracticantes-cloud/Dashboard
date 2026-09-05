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
        String celular = firstNonBlank(str(body.get("matchCelular")), str(body.get("celular")));
        String fecha = firstNonBlank(str(body.get("matchFecha")), str(body.get("fecha")));
        String clienteMatch = body.containsKey("matchCliente")
                ? str(body.get("matchCliente"))
                : str(body.get("cliente"));
        if (blank(celular) && blank(fecha)) {
            throw new BadRequestException("celular o fecha son obligatorios para localizar la fila");
        }

        Map<String, String> match = new LinkedHashMap<>();
        if (!blank(celular)) match.put("celular", celular);
        if (!blank(fecha)) match.put("fecha", fecha.length() >= 10 ? fecha.substring(0, 10) : fecha);
        if (!blank(clienteMatch)) match.put("cliente", clienteMatch);

        Map<String, Object> fields = new LinkedHashMap<>();
        putIfKey(fields, "FECHA", body, "fecha");
        putIfKey(fields, "CLIENTE", body, "cliente");
        putIfKey(fields, "CELULAR", body, "celular");
        putIfKey(fields, "CANAL", body, "canal");
        putIfKey(fields, "TIPO", body, "tipo");
        putIfKey(fields, "SEMAFORO", body, "semaforo");
        putIfKey(fields, "SOLICITUD", body, "solicitud");
        putIfKey(fields, "RESPUESTA", body, "respuesta");
        putIfKey(fields, "NOTAS", body, "notas");
        putIfKey(fields, "ASIGNADO", body, "asignado");
        putIfKey(fields, "PROXIMO SEGUIMIENTO", body, "proximoSeguimiento");
        putIfKey(fields, "FECHA SERVICIO", body, "fechaServicio");
        putIfKey(fields, "DISC", body, "disc");
        putIfKey(fields, "PRIORIZAR", body, "priorizar");
        putIfKey(fields, "PRIORIDAD", body, "priorizar");
        putIfKey(fields, "PENDIENTE", body, "pendiente");
        putIfKey(fields, "OBJECION", body, "objecion");
        putIfKey(fields, "EXCELENTE", body, "excelente");
        putIfKey(fields, "BUENA", body, "buena");
        putIfKey(fields, "REGULAR", body, "regular");
        putIfKey(fields, "REGISTRADO", body, "registrado");
        putIfKey(fields, "REGISTRADA", body, "registrado");
        putIfKey(fields, "FECHA COTIZADO", body, "fechaCotizado");
        putIfKey(fields, "FECHA PROXIMO SEGUIMIENTO", body, "proximoSeguimiento");
        if (body.containsKey("cotizado")) {
            fields.put("COTIZADO", boolLabel(body.get("cotizado")));
        }
        if (body.containsKey("encuesta")) {
            Object raw = body.get("encuesta");
            String label = str(raw);
            if (label.equalsIgnoreCase("PENDIENTE")) {
                fields.put("ENCUESTA", "PENDIENTE");
            } else {
                fields.put("ENCUESTA", boolLabel(raw));
            }
        }
        if (body.containsKey("monto")) {
            fields.put("MONTO", body.get("monto") == null ? "" : body.get("monto"));
        }

        SheetRowWriteResultDto result = write(new SheetRowWriteRequest("updaterow", sheetName, match, fields));
        patchSeguimientoCache(body, celular, fecha);
        return result;
    }

    public SheetRowWriteResultDto appendSeguimiento(Map<String, Object> body) {
        String sheetName = str(body.get("hojaOrigen"));
        if (blank(sheetName)) {
            throw new BadRequestException("Elija la hoja del Excel a la que quiere agregar la fila.");
        }
        if (blank(str(body.get("cliente"))) && blank(str(body.get("celular"))) && blank(str(body.get("solicitud")))) {
            throw new BadRequestException("Indique al menos cliente, celular o solicitud.");
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        putIfKey(fields, "FECHA", body, "fecha");
        putIfKey(fields, "TIPO", body, "tipo");
        putIfKey(fields, "CANAL", body, "canal");
        putIfKey(fields, "CLIENTE", body, "cliente");
        putIfKey(fields, "CELULAR", body, "celular");
        putIfKey(fields, "DISC", body, "disc");
        putIfKey(fields, "SOLICITUD", body, "solicitud");
        putIfKey(fields, "RESPUESTA", body, "respuesta");
        putIfKey(fields, "SEMAFORO", body, "semaforo");
        putIfKey(fields, "FECHA COTIZADO", body, "fechaCotizado");
        putIfKey(fields, "NOTAS", body, "notas");
        putIfKey(fields, "PROXIMO SEGUIMIENTO", body, "proximoSeguimiento");
        putIfKey(fields, "FECHA PROXIMO SEGUIMIENTO", body, "proximoSeguimiento");
        putIfKey(fields, "PRIORIZAR", body, "priorizar");
        putIfKey(fields, "PRIORIDAD", body, "priorizar");
        putIfKey(fields, "PENDIENTE", body, "pendiente");
        putIfKey(fields, "ASIGNADO", body, "asignado");
        putIfKey(fields, "FECHA SERVICIO", body, "fechaServicio");
        putIfKey(fields, "REGISTRADO", body, "registrado");
        putIfKey(fields, "REGISTRADA", body, "registrado");
        putIfKey(fields, "OBJECION", body, "objecion");
        if (body.containsKey("encuesta")) {
            Object raw = body.get("encuesta");
            String label = str(raw);
            if (label.equalsIgnoreCase("PENDIENTE")) {
                fields.put("ENCUESTA", "PENDIENTE");
            } else {
                fields.put("ENCUESTA", boolLabel(raw));
            }
        }
        if (body.containsKey("cotizado")) {
            fields.put("COTIZADO", boolLabel(body.get("cotizado")));
        }

        SheetRowWriteResultDto result = write(new SheetRowWriteRequest("appendrow", sheetName, Map.of(), fields));
        try {
            sheetsSyncService.prependSeguimientoRow(body);
        } catch (Exception ex) {
            log.warn("[SheetsWrite] No se pudo agregar la fila al cache: {}", ex.getMessage());
        }
        return result;
    }

    public SheetRowWriteResultDto updateVenta(Map<String, Object> body) {
        String sheetName = str(body.get("hojaOrigen"));
        if (blank(sheetName)) {
            sheetName = "VENTAS";
        }
        String celular = firstNonBlank(str(body.get("matchCelular")), str(body.get("celular")));
        String fecha = firstNonBlank(str(body.get("matchFecha")), str(body.get("fechaCot")));
        String nombreMatch = body.containsKey("matchNombre")
                ? str(body.get("matchNombre"))
                : str(body.get("nombre"));
        if (blank(celular) && blank(fecha) && blank(nombreMatch)) {
            throw new BadRequestException("celular, fechaCot o nombre requeridos");
        }

        Map<String, String> match = new LinkedHashMap<>();
        if (!blank(celular)) match.put("celular", celular);
        if (!blank(fecha)) match.put("fecha", fecha.length() >= 10 ? fecha.substring(0, 10) : fecha);
        if (!blank(nombreMatch)) match.put("cliente", nombreMatch);

        Map<String, Object> fields = new LinkedHashMap<>();
        putIfKey(fields, "NOMBRE", body, "nombre");
        putIfKey(fields, "CELULAR", body, "celular");
        putIfKey(fields, "TIPO CLIENTE", body, "tipoCliente");
        putIfKey(fields, "SERVICIO", body, "servicio");
        putIfKey(fields, "VENTA", body, "venta");
        putIfKey(fields, "CODIGO", body, "codigo");
        putIfKey(fields, "FECHA SERVICIO", body, "fechaServicio");
        putIfKey(fields, "REALIZADO", body, "realizado");
        putIfKey(fields, "ENVIO RESERVA", body, "envioReserva");
        putIfKey(fields, "PAGO AUTOBITS", body, "pagoAutobits");
        putIfKey(fields, "SOPORTE DRIVE", body, "soporteDrive");
        putIfKey(fields, "FECHA COT", body, "fechaCot");

        SheetRowWriteResultDto result = write(new SheetRowWriteRequest("updaterow", sheetName, match, fields));
        patchVentaCache(body, celular, fecha);
        return result;
    }

    private void patchSeguimientoCache(Map<String, Object> body, String matchCelular, String matchFecha) {
        try {
            sheetsSyncService.patchSeguimientoRow(
                    str(body.get("hojaOrigen")),
                    matchCelular,
                    matchFecha,
                    body
            );
        } catch (Exception ex) {
            log.warn("[SheetsWrite] No se pudo parchear cache seguimiento: {}", ex.getMessage());
        }
    }

    private void patchVentaCache(Map<String, Object> body, String matchCelular, String matchFecha) {
        try {
            sheetsSyncService.patchVentaRow(
                    str(body.get("hojaOrigen")),
                    matchCelular,
                    matchFecha,
                    body
            );
        } catch (Exception ex) {
            log.warn("[SheetsWrite] No se pudo parchear cache venta: {}", ex.getMessage());
        }
    }

    private static void putIfKey(Map<String, Object> fields, String sheetKey, Map<String, Object> body, String jsonKey) {
        if (body == null || !body.containsKey(jsonKey)) {
            return;
        }
        putField(fields, sheetKey, body.get(jsonKey));
    }

    private static void putField(Map<String, Object> fields, String key, Object value) {
        if (value == null) {
            fields.put(key, "");
            return;
        }
        if (value instanceof Boolean) {
            fields.put(key, boolLabel(value));
            return;
        }
        String s = String.valueOf(value);
        if ("null".equalsIgnoreCase(s.trim())) {
            fields.put(key, "");
            return;
        }
        fields.put(key, value);
    }

    private static String firstNonBlank(String a, String b) {
        return blank(a) ? b : a;
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
