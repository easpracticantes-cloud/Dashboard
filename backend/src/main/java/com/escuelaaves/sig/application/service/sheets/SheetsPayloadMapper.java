package com.escuelaaves.sig.application.service.sheets;

import com.escuelaaves.sig.application.dto.dashboard.sheets.B2bAgenciaDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.MonthlyPointDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.NamedCountDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.PaisResumenDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.PiezaPubDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.RawSheetDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SeguimientoWhatsappDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetSummaryDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetTableDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetsDashboardDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetsKpisDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.SheetsMetaDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.ToqueDto;
import com.escuelaaves.sig.application.dto.dashboard.sheets.VentaDto;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * Normaliza el payload multi-hoja del Apps Script.
 * Formato: {@code data[hoja] = { rawRowCount, firstFewRows, fullData }}.
 * También soporta el formato tipado legacy ({@code seguimientoWhatsapp}, etc.).
 */
@Slf4j
@Component
public class SheetsPayloadMapper {

    private static final Pattern DIGITS = Pattern.compile("\\d+");
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyy-MM");

    private static final List<String> ESTADISTICAS_SYNTHETIC_HEADERS = List.of(
            "Fecha", "Tipo", "Canal", "Cliente", "Solicitud", "Respuesta",
            "Semaforo", "Cotizado", "Notas", "Disc", "Priorizar", "Pendiente",
            "Objecion", "Excelente", "Buena", "Regular", "Registrado"
    );

    public SheetsDashboardDto map(JsonNode root, Instant cachedAt, boolean fromCache) {
        JsonNode data = root.has("data") && root.get("data").isObject() ? root.get("data") : root;

        List<String> hojasProcesadas = readStringArray(root.path("hojasProcesadas"));
        if (hojasProcesadas.isEmpty()) {
            Iterator<String> names = data.fieldNames();
            while (names.hasNext()) {
                hojasProcesadas.add(names.next());
            }
        }

        List<RawSheetDto> rawSheets = collectRawSheets(data, hojasProcesadas);

        List<SeguimientoWhatsappDto> seguimiento = new ArrayList<>();
        List<SeguimientoWhatsappDto> fromTyped = collectSeguimientoFromTyped(data);
        List<SeguimientoWhatsappDto> fromMatrices = collectSeguimientoFromMatrices(rawSheets);
        seguimiento.addAll(fromTyped);
        seguimiento.addAll(fromMatrices);

        RawSheetDto ventasSheet = findRaw(rawSheets, "VENTAS");
        List<VentaDto> ventas = parseVentas(ventasSheet);
        if (ventas.isEmpty()) {
            ventas = mapVentasTyped(data.path("ventas"));
        }
        for (VentaDto venta : ventas) {
            seguimiento.add(ventaToSeguimiento(venta));
        }

        int beforeDedupe = seguimiento.size();
        seguimiento = dedupeSeguimiento(seguimiento);
        log.info(
                "[SHEETS-MAP] typed={} matrices={} ventas={} antesDedupe={} despuesDedupe={} hojasRaw={}",
                fromTyped.size(),
                fromMatrices.size(),
                ventas.size(),
                beforeDedupe,
                seguimiento.size(),
                rawSheets.size()
        );

        List<NamedCountDto> porSemaforo = aggregate(seguimiento, SeguimientoWhatsappDto::semaforo);
        List<NamedCountDto> porCanal = aggregate(seguimiento, SeguimientoWhatsappDto::canal);
        List<NamedCountDto> porHoja = aggregate(seguimiento, SeguimientoWhatsappDto::hojaOrigen);
        List<NamedCountDto> porMes = aggregateByMonth(seguimiento);
        List<MonthlyPointDto> evolucion = buildEvolucion(seguimiento);
        SheetsKpisDto kpis = buildKpis(seguimiento);

        List<PaisResumenDto> paisesDetalle = parsePaises(findRaw(rawSheets, "PAÍSES", "PAISES"));
        if (paisesDetalle.isEmpty()) {
            paisesDetalle = mapPaisesTyped(data.path("resumenPaises"));
        }
        List<NamedCountDto> resumenPaises = paisesDetalle.stream()
                .map(p -> new NamedCountDto(p.pais(), p.cantidad()))
                .toList();

        List<ToqueDto> toques = parseToques(findRaw(rawSheets, "TOQUES"));
        if (toques.isEmpty()) {
            toques = mapToquesTyped(data.path("toques"));
        }

        List<PiezaPubDto> piezas = parsePiezasTransposed(findRaw(rawSheets, "PIEZAS PUB", "PIEZASPUB"));
        if (piezas.isEmpty()) {
            piezas = mapPiezasTyped(data.path("piezasPub"));
        }

        RawSheetDto b2bRaw = findRaw(rawSheets, "PARAMETRIZACION B2B RENTABLES", "PARAMETRIZACION B2B");
        List<B2bAgenciaDto> b2bAgencias = parseB2b(b2bRaw);
        SheetTableDto b2bTabla = b2bRaw != null ? toSmartTable(b2bRaw, List.of("AGENCIA", "EMPRESA", "COTIZACIONES")) : emptyTable("");

        RawSheetDto estadisticasRaw = findRaw(rawSheets, "ESTADISTICAS", "ESTADÍSTICAS");
        SheetTableDto estadisticas = toEstadisticasTable(estadisticasRaw);
        SheetTableDto despliegue = toSmartTable(findRaw(rawSheets, "DESPLIEGUE SEMANAL"), List.of("MES", "SEMANA", "DESPLIEGUE"));
        SheetTableDto planComercial = toSmartTable(findRaw(rawSheets, "PLAN COMERCIAL", "PLAN COMERCIAL "), List.of("MES", "SEMANA", "PLAN", "META"));

        List<SheetSummaryDto> hojas = mapHojas(rawSheets, seguimiento);

        String sheetName = hojasProcesadas.isEmpty()
                ? text(root, "sheetName")
                : hojasProcesadas.size() + " hojas";

        JsonNode b2b = data.path("b2b");
        String b2bStatus = text(b2b, "status");
        String b2bMensaje = text(b2b, "mensaje");
        if (b2bStatus.isBlank() && !b2bAgencias.isEmpty()) {
            b2bStatus = "OK";
            b2bMensaje = b2bAgencias.size() + " agencias B2B";
        }

        int totalHojas = root.path("totalHojas").asInt(hojasProcesadas.size());
        if (totalHojas <= 0) {
            totalHojas = Math.max(hojasProcesadas.size(), rawSheets.size());
        }

        SheetsMetaDto meta = new SheetsMetaDto(
                firstNonBlank(text(root, "ultimaActualizacion"), text(data, "ultimaActualizacion")),
                sheetName,
                cachedAt.toString(),
                fromCache,
                hojasProcesadas,
                totalHojas
        );

        return new SheetsDashboardDto(
                meta,
                kpis,
                porSemaforo,
                porCanal,
                porHoja,
                porMes,
                evolucion,
                seguimiento,
                ventas,
                resumenPaises,
                paisesDetalle,
                hojas,
                toques,
                piezas,
                b2bAgencias,
                b2bTabla,
                estadisticas,
                despliegue,
                planComercial,
                rawSheets,
                b2bStatus,
                b2bMensaje,
                true,
                "OK"
        );
    }

    public SheetsDashboardDto empty(boolean success, String message) {
        Instant now = Instant.now();
        return new SheetsDashboardDto(
                new SheetsMetaDto(null, null, now.toString(), false, List.of(), 0),
                new SheetsKpisDto(0, 0, 0, 0, 0),
                List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(),
                List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of(),
                emptyTable(""), emptyTable(""), emptyTable(""), emptyTable(""),
                List.of(),
                null, null,
                success,
                message
        );
    }

    public SheetsDashboardDto withCacheFlag(SheetsDashboardDto dto, boolean fromCache) {
        SheetsMetaDto meta = new SheetsMetaDto(
                dto.meta().ultimaActualizacion(),
                dto.meta().sheetName(),
                dto.meta().cachedAt(),
                fromCache,
                dto.meta().hojasProcesadas() != null ? dto.meta().hojasProcesadas() : List.of(),
                dto.meta().totalHojas()
        );
        return new SheetsDashboardDto(
                meta,
                dto.kpis(),
                dto.porSemaforo(),
                dto.porCanal(),
                dto.porHoja(),
                dto.porMes(),
                dto.evolucionMensual(),
                dto.seguimientoWhatsapp(),
                dto.ventas(),
                dto.resumenPaises(),
                dto.paisesDetalle(),
                dto.hojas(),
                dto.toques(),
                dto.piezasPub(),
                dto.b2bAgencias(),
                dto.b2bTabla(),
                dto.estadisticas(),
                dto.despliegueSemanal(),
                dto.planComercial(),
                dto.rawSheets(),
                dto.b2bStatus(),
                dto.b2bMensaje(),
                dto.success(),
                dto.message()
        );
    }

    /* ===================== Raw sheets ===================== */

    private List<RawSheetDto> collectRawSheets(JsonNode data, List<String> hojasProcesadas) {
        Map<String, RawSheetDto> byName = new LinkedHashMap<>();
        for (String name : hojasProcesadas) {
            JsonNode node = findDataNode(data, name);
            if (node != null) {
                byName.put(name, toRawSheet(name, node));
            }
        }
        Iterator<Map.Entry<String, JsonNode>> fields = data.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String key = entry.getKey();
            JsonNode value = entry.getValue();
            if (byName.containsKey(key)) {
                continue;
            }
            if (value != null && value.isObject()
                    && (value.has("fullData") || value.has("firstFewRows") || value.has("rawRowCount") || value.has("rowCount"))) {
                byName.put(key, toRawSheet(key, value));
            }
        }
        return new ArrayList<>(byName.values());
    }

    private JsonNode findDataNode(JsonNode data, String name) {
        if (data.has(name)) {
            return data.get(name);
        }
        String target = normalizeKey(name);
        Iterator<String> names = data.fieldNames();
        while (names.hasNext()) {
            String key = names.next();
            if (normalizeKey(key).equals(target) || normalizeKey(key).contains(target) || target.contains(normalizeKey(key))) {
                return data.get(key);
            }
        }
        return null;
    }

    private RawSheetDto toRawSheet(String nombre, JsonNode node) {
        boolean hasFull = node.has("fullData") && node.get("fullData").isArray();
        boolean hasPreview = node.has("firstFewRows") && node.get("firstFewRows").isArray();
        List<List<Object>> full = matrix(hasFull ? node.get("fullData") : node.path("firstFewRows"));
        long rawCount = node.path("rawRowCount").asLong(0);
        if (rawCount <= 0) {
            rawCount = node.path("rowCount").asLong(full.size());
        }
        if (rawCount <= 0) {
            rawCount = full.size();
        }
        if (!hasFull && hasPreview) {
            log.warn(
                    "[SHEETS-MAP] Hoja '{}' SIN fullData: usando firstFewRows={} (rawRowCount={}). "
                            + "Posible truncado del Web App / timeout Apps Script.",
                    nombre,
                    full.size(),
                    rawCount
            );
        } else if (hasFull && rawCount > full.size() + 5) {
            log.warn(
                    "[SHEETS-MAP] Hoja '{}': rawRowCount={} > fullData.size={} — faltan filas en el payload.",
                    nombre,
                    rawCount,
                    full.size()
            );
        } else {
            log.info("[SHEETS-MAP] Hoja '{}': filasLeidas={} rawRowCount={} fullData={}",
                    nombre, full.size(), rawCount, hasFull);
        }
        return new RawSheetDto(nombre, rawCount, full);
    }

    /**
     * Elimina duplicados tipado+matriz (misma identidad de chat).
     * Conserva la primera aparición (matrices suelen ir después y sobrescriben si usamos LinkedHashMap put).
     * Preferimos la última (matrices) porque suelen traer más columnas.
     */
    private List<SeguimientoWhatsappDto> dedupeSeguimiento(List<SeguimientoWhatsappDto> rows) {
        Map<String, SeguimientoWhatsappDto> unique = new LinkedHashMap<>();
        for (SeguimientoWhatsappDto row : rows) {
            if (row == null) {
                continue;
            }
            unique.put(seguimientoIdentity(row), row);
        }
        return new ArrayList<>(unique.values());
    }

    private static String seguimientoIdentity(SeguimientoWhatsappDto row) {
        return String.join("|",
                normId(row.celular()),
                normId(row.fecha()),
                normId(row.solicitud()),
                normId(row.canal()),
                normId(row.hojaOrigen()),
                normId(row.respuesta()),
                normId(row.registrado())
        );
    }

    private static String normId(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private List<List<Object>> matrix(JsonNode array) {
        List<List<Object>> rows = new ArrayList<>();
        if (array == null || !array.isArray()) {
            return rows;
        }
        for (JsonNode row : array) {
            List<Object> cells = new ArrayList<>();
            if (row != null && row.isArray()) {
                for (JsonNode cell : row) {
                    cells.add(jsonCell(cell));
                }
            }
            rows.add(cells);
        }
        return rows;
    }

    private Object jsonCell(JsonNode cell) {
        if (cell == null || cell.isNull() || cell.isMissingNode()) {
            return "";
        }
        if (cell.isNumber()) {
            if (cell.isIntegralNumber()) {
                return cell.longValue();
            }
            return cell.doubleValue();
        }
        if (cell.isBoolean()) {
            return cell.booleanValue();
        }
        return cell.asText("");
    }

    private RawSheetDto findRaw(List<RawSheetDto> sheets, String... names) {
        for (String name : names) {
            String target = normalizeKey(name);
            for (RawSheetDto sheet : sheets) {
                String key = normalizeKey(sheet.nombre());
                if (key.equals(target) || key.contains(target) || target.contains(key)) {
                    return sheet;
                }
            }
        }
        return null;
    }

    /* ===================== Seguimiento ===================== */

    private List<SeguimientoWhatsappDto> collectSeguimientoFromTyped(JsonNode data) {
        List<SeguimientoWhatsappDto> all = new ArrayList<>();
        if (data.path("seguimientoWhatsapp").isArray()) {
            all.addAll(mapSeguimientoArray(data.path("seguimientoWhatsapp"), "seguimientoWhatsapp"));
        }
        Iterator<Map.Entry<String, JsonNode>> fields = data.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            JsonNode value = entry.getValue();
            if (!value.isArray() || value.isEmpty()) {
                continue;
            }
            JsonNode first = value.get(0);
            if (first != null && first.isObject() && (first.has("celular") || first.has("semaforo"))) {
                all.addAll(mapSeguimientoArray(value, entry.getKey()));
            }
        }
        return all;
    }

    private List<SeguimientoWhatsappDto> collectSeguimientoFromMatrices(List<RawSheetDto> sheets) {
        List<SeguimientoWhatsappDto> all = new ArrayList<>();
        for (RawSheetDto sheet : sheets) {
            if (isNonSeguimientoSheet(sheet.nombre())) {
                continue;
            }
            List<SeguimientoWhatsappDto> parsed = parseSeguimientoMatrix(sheet.fullData(), sheet.nombre());
            if (parsed.isEmpty() && isEstadisticasSheet(sheet.nombre())) {
                parsed = parseEstadisticasInferred(sheet.fullData(), sheet.nombre());
            }
            all.addAll(parsed);
        }
        return all;
    }

    /** Hojas excluidas del barrido automático de seguimiento (VENTAS se parsea aparte). */
    private boolean isNonSeguimientoSheet(String nombre) {
        String n = normalizeKey(nombre);
        return n.contains("PAIS") || n.equals("TOQUES") || n.contains("PIEZAS")
                || n.contains("PARAMETRIZACION") || n.contains("DESPLIEGUE")
                || n.contains("PLANCOMERCIAL") || n.equals("VENTAS") || n.contains("VENTAS");
    }

    private boolean isEstadisticasSheet(String nombre) {
        String n = normalizeKey(nombre);
        return n.contains("ESTADISTIC");
    }

    private List<SeguimientoWhatsappDto> parseSeguimientoMatrix(List<List<Object>> rows, String hojaOrigen) {
        List<SeguimientoWhatsappDto> list = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            return list;
        }
        int headerIdx = -1;
        Map<String, Integer> cols = Map.of();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Integer> found = detectSeguimientoHeader(rows.get(i));
            if (!found.isEmpty()) {
                headerIdx = i;
                cols = found;
                break;
            }
        }
        if (headerIdx < 0) {
            return list;
        }
        for (int i = headerIdx + 1; i < rows.size(); i++) {
            SeguimientoWhatsappDto dto = mapSeguimientoRow(rows.get(i), cols, hojaOrigen);
            if (dto != null) {
                list.add(dto);
            }
        }
        return list;
    }

    private List<SeguimientoWhatsappDto> parseEstadisticasInferred(List<List<Object>> rows, String hojaOrigen) {
        List<SeguimientoWhatsappDto> list = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            return list;
        }
        int dataLike = 0;
        for (List<Object> row : rows) {
            if (looksLikeEstadisticasDataRow(row)) {
                dataLike++;
            }
        }
        if (dataLike < 2) {
            return list;
        }
        Map<String, Integer> cols = inferredEstadisticasColumns();
        for (List<Object> row : rows) {
            if (!looksLikeEstadisticasDataRow(row)) {
                continue;
            }
            SeguimientoWhatsappDto dto = mapSeguimientoRow(row, cols, hojaOrigen);
            if (dto != null) {
                list.add(dto);
            }
        }
        return list;
    }

    private Map<String, Integer> inferredEstadisticasColumns() {
        Map<String, Integer> cols = new HashMap<>();
        cols.put("fecha", 0);
        cols.put("tipo", 1);
        cols.put("canal", 2);
        cols.put("cliente", 3);
        cols.put("solicitud", 4);
        cols.put("respuesta", 5);
        cols.put("semaforo", 6);
        cols.put("cotizado", 7);
        cols.put("notas", 8);
        cols.put("disc", 9);
        cols.put("priorizar", 10);
        cols.put("pendiente", 11);
        cols.put("objecion", 12);
        cols.put("excelente", 13);
        cols.put("buena", 14);
        cols.put("regular", 15);
        cols.put("registrado", 16);
        return cols;
    }

    private boolean looksLikeEstadisticasDataRow(List<Object> row) {
        if (row == null || row.size() < 3) {
            return false;
        }
        String fecha = cellAt(row, 0);
        if (!looksLikeDate(fecha)) {
            return false;
        }
        if ("FECHA".equalsIgnoreCase(fecha.trim())) {
            return false;
        }
        String canal = cellAt(row, 2);
        String semaforo = row.size() > 6 ? cellAt(row, 6) : "";
        String cliente = cellAt(row, 3);
        return !canal.isBlank() || !semaforo.isBlank() || !cliente.isBlank();
    }

    private Map<String, Integer> detectSeguimientoHeader(List<Object> row) {
        Map<String, Integer> cols = new HashMap<>();
        if (row == null) {
            return cols;
        }
        for (int i = 0; i < row.size(); i++) {
            String h = normalizeHeader(cellStr(row.get(i)));
            if (h.isBlank()) {
                continue;
            }
            mapSeguimientoHeaderCell(h, i, cols);
        }
        boolean ok = cols.containsKey("fecha")
                && (cols.containsKey("celular") || cols.containsKey("semaforo") || cols.containsKey("cliente"));
        return ok ? cols : Map.of();
    }

    private void mapSeguimientoHeaderCell(String h, int i, Map<String, Integer> cols) {
        if (h.equals("FECHA") || h.equals("DATE")) {
            cols.putIfAbsent("fecha", i);
        } else if (h.equals("TIPO") || h.equals("TYPE")) {
            cols.putIfAbsent("tipo", i);
        } else if (h.equals("CANAL") || h.equals("CHANNEL")) {
            cols.putIfAbsent("canal", i);
        } else if (h.equals("CLIENTE") || h.equals("CLIENT") || h.equals("NOMBRE")) {
            cols.putIfAbsent("cliente", i);
        } else if (h.equals("CELULAR") || h.equals("TELEFONO") || h.equals("PHONE") || h.equals("WHATSAPP")) {
            cols.putIfAbsent("celular", i);
        } else if (h.equals("SOLICITUD") || h.equals("REQUEST")) {
            cols.putIfAbsent("solicitud", i);
        } else if (h.equals("RESPUESTA") || h.equals("RESPONSE")) {
            cols.putIfAbsent("respuesta", i);
        } else if (h.equals("SEMAFORO") || h.contains("SEMAFORO")) {
            cols.putIfAbsent("semaforo", i);
        } else if (h.contains("FECHA COTIZADO") || h.contains("FECHA DE COTIZACION") || h.contains("FECHA COTIZACION")) {
            cols.putIfAbsent("fechaCotizado", i);
        } else if (h.equals("COTIZADO") || h.equals("QUOTED")) {
            cols.putIfAbsent("cotizado", i);
        } else if (h.equals("MONTO") || h.equals("VALOR") || h.equals("PRECIO") || h.equals("TOTAL")
                || h.contains("VALOR COTIZ") || h.contains("MONTO COTIZ")) {
            cols.putIfAbsent("monto", i);
        } else if (h.equals("NOTAS") || h.equals("NOTES") || h.equals("OBSERVACIONES")) {
            cols.putIfAbsent("notas", i);
        } else if (h.contains("FECHA SERVICIO") || h.equals("FECHASERVICIO")) {
            cols.putIfAbsent("fechaServicio", i);
        } else if (h.contains("SERVICIO") && !h.contains("FECHA")) {
            cols.putIfAbsent("solicitud", i);
        } else if (h.equals("ENCUESTA") || h.equals("SURVEY")) {
            cols.putIfAbsent("encuesta", i);
        } else if (h.equals("ASIGNADO") || h.equals("ASSIGNED") || h.equals("ASESOR")) {
            cols.putIfAbsent("asignado", i);
        } else if (h.contains("PROXIMO SEGUIMIENTO") || h.contains("PROXIMOSEG")) {
            cols.putIfAbsent("proximoSeguimiento", i);
        } else if (h.equals("DISC")) {
            cols.putIfAbsent("disc", i);
        } else if (h.equals("PRIORIZAR")) {
            cols.putIfAbsent("priorizar", i);
        } else if (h.equals("PENDIENTE")) {
            cols.putIfAbsent("pendiente", i);
        } else if (h.equals("OBJECCION") || h.equals("OBJECION")) {
            cols.putIfAbsent("objecion", i);
        } else if (h.equals("EXCELENTE")) {
            cols.putIfAbsent("excelente", i);
        } else if (h.equals("BUENA")) {
            cols.putIfAbsent("buena", i);
        } else if (h.equals("REGULAR")) {
            cols.putIfAbsent("regular", i);
        } else if (h.equals("REGISTRADO") || h.equals("REGISTRADA")) {
            cols.putIfAbsent("registrado", i);
        }
    }

    private SeguimientoWhatsappDto mapSeguimientoRow(List<Object> row, Map<String, Integer> cols, String hojaOrigen) {
        String celular = col(row, cols, "celular");
        String cliente = col(row, cols, "cliente");
        String semaforo = normalizeSemaforo(col(row, cols, "semaforo"));
        String fecha = col(row, cols, "fecha");
        String canal = col(row, cols, "canal");
        if (celular.isBlank() && cliente.isBlank() && semaforo.isBlank() && fecha.isBlank()) {
            return null;
        }
        if ("FECHA".equalsIgnoreCase(fecha) || "CELULAR".equalsIgnoreCase(celular)) {
            return null;
        }
        if (celular.isBlank() && cliente.isBlank() && canal.isBlank() && semaforo.isBlank()) {
            return null;
        }

        String cotizadoRaw = col(row, cols, "cotizado");
        String fechaCotRaw = col(row, cols, "fechaCotizado");
        String fechaCotizado = "";
        boolean cotizado = false;
        if (looksLikeDate(fechaCotRaw)) {
            fechaCotizado = normalizeDate(fechaCotRaw);
            cotizado = true;
        } else if (!fechaCotRaw.isBlank()) {
            cotizado = asBool(fechaCotRaw);
        }
        if (looksLikeDate(cotizadoRaw)) {
            fechaCotizado = firstNonBlank(fechaCotizado, normalizeDate(cotizadoRaw));
            cotizado = true;
        } else if (!cotizadoRaw.isBlank()) {
            cotizado = cotizado || asBool(cotizadoRaw);
        }

        String solicitud = col(row, cols, "solicitud");
        String respuesta = col(row, cols, "respuesta");
        String notas = col(row, cols, "notas");
        String registrado = col(row, cols, "registrado");
        BigDecimal monto = parseMoney(col(row, cols, "monto"));
        if (monto.signum() <= 0) {
            monto = extractMoney(solicitud + " " + respuesta + " " + notas + " " + registrado);
        }

        return new SeguimientoWhatsappDto(
                normalizeDate(fecha),
                col(row, cols, "tipo"),
                canal.isBlank() ? "SIN_DATO" : canal.trim().toUpperCase(Locale.ROOT),
                cliente,
                celular,
                solicitud,
                respuesta,
                semaforo.isBlank() ? "SIN_DATO" : semaforo,
                cotizado,
                notas,
                normalizeDate(col(row, cols, "fechaServicio")),
                asBool(col(row, cols, "encuesta")),
                col(row, cols, "asignado"),
                normalizeDate(col(row, cols, "proximoSeguimiento")),
                hojaOrigen,
                col(row, cols, "disc"),
                col(row, cols, "priorizar"),
                col(row, cols, "pendiente"),
                col(row, cols, "objecion"),
                col(row, cols, "excelente"),
                col(row, cols, "buena"),
                col(row, cols, "regular"),
                registrado,
                fechaCotizado,
                monto
        );
    }

    private List<SeguimientoWhatsappDto> mapSeguimientoArray(JsonNode array, String hojaOrigen) {
        List<SeguimientoWhatsappDto> list = new ArrayList<>();
        if (!array.isArray()) {
            return list;
        }
        for (JsonNode item : array) {
            if (!item.isObject()) {
                continue;
            }
            String celular = text(item, "celular");
            String cliente = text(item, "cliente");
            if (celular.isBlank() && cliente.isBlank()) {
                continue;
            }
            BigDecimal monto = item.has("monto") && item.path("monto").isNumber()
                    ? item.path("monto").decimalValue()
                    : parseMoney(text(item, "monto"));
            if (monto.signum() <= 0) {
                monto = extractMoney(text(item, "solicitud") + " " + text(item, "respuesta") + " " + text(item, "notas"));
            }
            list.add(new SeguimientoWhatsappDto(
                    text(item, "fecha"),
                    text(item, "tipo"),
                    text(item, "canal"),
                    cliente,
                    celular,
                    text(item, "solicitud"),
                    text(item, "respuesta"),
                    normalizeSemaforo(text(item, "semaforo")),
                    item.path("cotizado").isBoolean() ? item.path("cotizado").asBoolean(false) : asBool(text(item, "cotizado")),
                    text(item, "notas"),
                    text(item, "fechaServicio"),
                    item.path("encuesta").isBoolean() ? item.path("encuesta").asBoolean(false) : asBool(text(item, "encuesta")),
                    text(item, "asignado"),
                    text(item, "proximoSeguimiento"),
                    hojaOrigen,
                    text(item, "disc"),
                    text(item, "priorizar"),
                    text(item, "pendiente"),
                    firstNonBlank(text(item, "objecion"), text(item, "objeccion")),
                    text(item, "excelente"),
                    text(item, "buena"),
                    text(item, "regular"),
                    firstNonBlank(text(item, "registrado"), text(item, "registrada")),
                    firstNonBlank(text(item, "fechaCotizado"), text(item, "fechaCotizacion")),
                    monto
            ));
        }
        return list;
    }

    private SeguimientoWhatsappDto ventaToSeguimiento(VentaDto venta) {
        BigDecimal monto = extractMoney(
                blank(venta.soporteDrive()) + " " + blank(venta.pagoAutobits())
        );
        String fecha = "";
        if (looksLikeDate(venta.fechaCot())) {
            fecha = normalizeDate(venta.fechaCot());
        } else if (looksLikeDate(venta.fechaServicio())) {
            fecha = normalizeDate(venta.fechaServicio());
        }
        String notas = blank(venta.soporteDrive());
        return new SeguimientoWhatsappDto(
                fecha,
                venta.tipoCliente(),
                "VENTAS",
                venta.nombre(),
                venta.celular(),
                venta.servicio(),
                "",
                "VENTA",
                true,
                notas,
                looksLikeDate(venta.fechaServicio()) ? normalizeDate(venta.fechaServicio()) : blank(venta.fechaServicio()),
                false,
                "",
                "",
                firstNonBlank(venta.hojaOrigen(), "VENTAS"),
                "", "", "", "", "", "", "", "",
                fecha,
                monto
        );
    }

    /* ===================== Ventas ===================== */

    private List<VentaDto> parseVentas(RawSheetDto sheet) {
        List<VentaDto> list = new ArrayList<>();
        if (sheet == null || sheet.fullData() == null) {
            return list;
        }
        HeaderMap hm = detectHeader(sheet.fullData(), aliasMap(
                "fechaCot", List.of("FECHA COT", "FECHA COTIZACION", "FECHA COTIZACIÓN", "FECHACOT"),
                "tipoCliente", List.of("TIPO DE CLIENTE", "TIPO CLIENTE"),
                "nombre", List.of("NOMBRE"),
                "celular", List.of("CELULAR", "TELEFONO", "TELÉFONO", "WHATSAPP"),
                "servicio", List.of("SERVICIO"),
                "venta", List.of("VENTA"),
                "codigo", List.of("CODIGO", "CÓDIGO", "CODE"),
                "fechaServicio", List.of("FECHA SERVICIO", "FECHA DE SERVICIO"),
                "realizado", List.of("REALIZADO"),
                "envioReserva", List.of("ENVIO RESERVA DE AUTOBITS", "ENVIO RESERVA", "ENVÍO RESERVA"),
                "pagoAutobits", List.of("PAGO AUTOBITS", "PAGO AUTOBIT"),
                "soporteDrive", List.of("SOPORTE EN DRIVE", "SOPORTE DRIVE", "SOPORTE")
        ));
        if (hm.headerIdx < 0) {
            return list;
        }
        String hoja = sheet.nombre();
        for (int i = hm.headerIdx + 1; i < sheet.fullData().size(); i++) {
            List<Object> row = sheet.fullData().get(i);
            String nombre = hm.col(row, "nombre");
            String celular = hm.col(row, "celular");
            String servicio = hm.col(row, "servicio");
            if (nombre.isBlank() && celular.isBlank() && servicio.isBlank()) {
                continue;
            }
            if ("NOMBRE".equalsIgnoreCase(nombre) || "FECHA COT".equalsIgnoreCase(hm.col(row, "fechaCot"))) {
                continue;
            }
            list.add(new VentaDto(
                    normalizeDate(hm.col(row, "fechaCot")),
                    hm.col(row, "tipoCliente"),
                    nombre,
                    celular,
                    servicio,
                    hm.col(row, "venta"),
                    hm.col(row, "codigo"),
                    normalizeDate(hm.col(row, "fechaServicio")),
                    hm.col(row, "realizado"),
                    hm.col(row, "envioReserva"),
                    hm.col(row, "pagoAutobits"),
                    hm.col(row, "soporteDrive"),
                    hoja
            ));
        }
        return list;
    }

    private List<VentaDto> mapVentasTyped(JsonNode array) {
        if (!array.isArray()) {
            return List.of();
        }
        List<VentaDto> list = new ArrayList<>();
        for (JsonNode item : array) {
            String nombre = text(item, "nombre");
            if (nombre.isBlank()) {
                continue;
            }
            list.add(new VentaDto(
                    text(item, "fechaCot"),
                    text(item, "tipoCliente"),
                    nombre,
                    text(item, "celular"),
                    text(item, "servicio"),
                    text(item, "venta"),
                    text(item, "codigo"),
                    text(item, "fechaServicio"),
                    text(item, "realizado"),
                    text(item, "envioReserva"),
                    text(item, "pagoAutobits"),
                    text(item, "soporteDrive"),
                    firstNonBlank(text(item, "hojaOrigen"), "VENTAS")
            ));
        }
        return list;
    }

    /* ===================== Países / Toques / Piezas / B2B ===================== */

    private List<PaisResumenDto> parsePaises(RawSheetDto sheet) {
        List<PaisResumenDto> list = new ArrayList<>();
        if (sheet == null || sheet.fullData() == null) {
            return list;
        }
        int headerIdx = -1;
        int colPais = -1;
        int colCodigo = -1;
        int colCant = -1;
        List<List<Object>> rows = sheet.fullData();
        for (int i = 0; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            for (int c = 0; c < row.size(); c++) {
                String h = normalizeHeader(cellStr(row.get(c)));
                if (h.equals("PAIS") || h.equals("COUNTRY")) {
                    headerIdx = i;
                    colPais = c;
                } else if (headerIdx == i && (h.equals("CODIGO") || h.equals("CODE"))) {
                    colCodigo = c;
                } else if (headerIdx == i && (h.contains("CANTIDAD") || h.equals("NUMEROS") || h.contains("NUMERO"))) {
                    colCant = c;
                }
            }
            if (headerIdx == i && colPais >= 0) {
                break;
            }
        }
        if (headerIdx < 0 || colPais < 0) {
            for (List<Object> row : rows) {
                String pais = "";
                String codigo = "";
                long cant = 0;
                for (Object cell : row) {
                    String s = cellStr(cell).trim();
                    if (s.isBlank()) {
                        continue;
                    }
                    if (DIGITS.matcher(s).matches() && s.length() <= 4 && codigo.isBlank()) {
                        codigo = s;
                    } else if (DIGITS.matcher(s).matches() && s.length() <= 6) {
                        cant = Long.parseLong(s);
                    } else if (s.length() >= 3 && !isGarbagePais(s)) {
                        pais = s;
                    }
                }
                if (!pais.isBlank() && cant > 0) {
                    list.add(new PaisResumenDto(pais, codigo, cant));
                }
            }
            list.sort(Comparator.comparingLong(PaisResumenDto::cantidad).reversed());
            return list;
        }
        for (int i = headerIdx + 1; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            String pais = cellAt(row, colPais);
            if (pais.isBlank() || isGarbagePais(pais)) {
                continue;
            }
            String codigo = colCodigo >= 0 ? cellAt(row, colCodigo) : "";
            long cant = colCant >= 0 ? asLong(cellAt(row, colCant)) : 0;
            if (cant <= 0) {
                continue;
            }
            list.add(new PaisResumenDto(pais.trim(), codigo.trim(), cant));
        }
        list.sort(Comparator.comparingLong(PaisResumenDto::cantidad).reversed());
        return list;
    }

    private List<PaisResumenDto> mapPaisesTyped(JsonNode array) {
        if (!array.isArray()) {
            return List.of();
        }
        List<PaisResumenDto> list = new ArrayList<>();
        for (JsonNode item : array) {
            String pais = text(item, "pais");
            long cantidad = item.path("cantidad").asLong(0);
            if (cantidad <= 0 || pais.isBlank() || isGarbagePais(pais)) {
                continue;
            }
            list.add(new PaisResumenDto(pais, text(item, "codigo"), cantidad));
        }
        list.sort(Comparator.comparingLong(PaisResumenDto::cantidad).reversed());
        return list;
    }

    private List<ToqueDto> parseToques(RawSheetDto sheet) {
        List<ToqueDto> list = new ArrayList<>();
        if (sheet == null) {
            return list;
        }
        HeaderMap hm = detectHeader(sheet.fullData(),
                Map.of(
                        "agencia", List.of("AGENCIA", "EMPRESA", "CLIENTE"),
                        "asesor", List.of("ASESOR", "CONTACTO", "NOMBRE"),
                        "telefono", List.of("TELEFONO", "TELÉFONO", "CELULAR", "PHONE"),
                        "correo", List.of("CORREO", "EMAIL", "MAIL"),
                        "medio", List.of("MEDIO", "CANAL")
                ));
        if (hm.headerIdx < 0) {
            return list;
        }
        for (int i = hm.headerIdx + 1; i < sheet.fullData().size(); i++) {
            List<Object> row = sheet.fullData().get(i);
            String agencia = hm.col(row, "agencia");
            if (agencia.isBlank() || "AGENCIA".equalsIgnoreCase(agencia)) {
                continue;
            }
            list.add(new ToqueDto(
                    agencia,
                    hm.col(row, "asesor"),
                    hm.col(row, "telefono"),
                    hm.col(row, "correo"),
                    hm.col(row, "medio")
            ));
        }
        return list;
    }

    private List<ToqueDto> mapToquesTyped(JsonNode array) {
        if (!array.isArray()) {
            return List.of();
        }
        List<ToqueDto> list = new ArrayList<>();
        for (JsonNode item : array) {
            String agencia = text(item, "agencia");
            if (agencia.isBlank() || "AGENCIA".equalsIgnoreCase(agencia)) {
                continue;
            }
            list.add(new ToqueDto(
                    agencia,
                    text(item, "asesor"),
                    text(item, "telefono"),
                    text(item, "correo"),
                    text(item, "medio")
            ));
        }
        return list;
    }

    private List<PiezaPubDto> parsePiezasTransposed(RawSheetDto sheet) {
        List<PiezaPubDto> list = new ArrayList<>();
        if (sheet == null || sheet.fullData() == null || sheet.fullData().isEmpty()) {
            return list;
        }
        List<List<Object>> rows = sheet.fullData();
        int nameRowIdx = 0;
        for (int i = 0; i < Math.min(5, rows.size()); i++) {
            String col0 = normalizeHeader(cellAt(rows.get(i), 0));
            if (col0.contains("PIEZA") || nonEmpty(rows.get(i)).size() >= 3) {
                nameRowIdx = i;
                break;
            }
        }
        List<Object> nameRow = rows.get(nameRowIdx);
        int maxCol = 0;
        for (List<Object> row : rows) {
            maxCol = Math.max(maxCol, row == null ? 0 : row.size());
        }
        int rowFecha = findLabelRow(rows, "FECHA DE ENVIO", "FECHA ENVIO", "FECHAENVIO");
        int rowAgencias = findLabelRow(rows, "AGENCIAS QUE", "AGENCIAS");
        int rowNumAgencias = findLabelRow(rows, "NUMERO AGENCIAS", "NUMERO DE AGENCIAS", "N AGENCIAS");
        int rowResultados = findLabelRow(rows, "RESULTADOS B2B", "RESULTADOS", "RESULTADO");

        for (int c = 1; c < maxCol; c++) {
            String pieza = cellAt(nameRow, c).trim();
            String piezaNorm = normalizeHeader(pieza);
            if (pieza.isBlank() || piezaNorm.equals("PIEZA GRAFICA") || piezaNorm.equals("PIEZA GRAFICA")) {
                continue;
            }
            if (piezaNorm.startsWith("FECHA") || piezaNorm.startsWith("AGENCIA") || piezaNorm.startsWith("NUMERO")) {
                continue;
            }
            String fechaEnvio = rowFecha >= 0 ? cellAt(rows.get(rowFecha), c).trim() : "";
            String agencias = rowAgencias >= 0 ? cellAt(rows.get(rowAgencias), c).trim() : "";
            String numeroAgencias = rowNumAgencias >= 0 ? cellAt(rows.get(rowNumAgencias), c).trim() : "";
            String resultados = rowResultados >= 0 ? cellAt(rows.get(rowResultados), c).trim() : "";
            list.add(new PiezaPubDto(pieza, fechaEnvio, agencias, numeroAgencias, resultados));
        }
        return list;
    }

    private int findLabelRow(List<List<Object>> rows, String... labels) {
        for (int i = 0; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            if (row == null || row.isEmpty()) {
                continue;
            }
            // Busca la etiqueta en las primeras celdas (no solo col 0).
            for (int c = 0; c < Math.min(3, row.size()); c++) {
                String cell = normalizeHeader(cellAt(row, c));
                if (cell.isBlank()) {
                    continue;
                }
                for (String label : labels) {
                    String target = normalizeHeader(label);
                    if (cell.equals(target) || cell.startsWith(target) || cell.contains(target)) {
                        return i;
                    }
                }
            }
        }
        return -1;
    }

    private List<PiezaPubDto> mapPiezasTyped(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isArray()) {
            List<PiezaPubDto> list = new ArrayList<>();
            for (JsonNode item : node) {
                String pieza = firstNonBlank(text(item, "pieza"), text(item, "nombre"));
                if (pieza.isBlank()) {
                    continue;
                }
                list.add(new PiezaPubDto(
                        pieza,
                        firstNonBlank(text(item, "fechaEnvio"), text(item, "fecha")),
                        text(item, "agencias"),
                        text(item, "numeroAgencias"),
                        text(item, "resultados")
                ));
            }
            return list;
        }
        return List.of();
    }

    private List<B2bAgenciaDto> parseB2b(RawSheetDto sheet) {
        List<B2bAgenciaDto> list = new ArrayList<>();
        if (sheet == null) {
            return list;
        }
        HeaderMap hm = detectHeader(sheet.fullData(), aliasMap(
                "agencia", List.of("AGENCIA", "EMPRESA", "NOMBRE", "CLIENTE"),
                "estado", List.of("ESTADO", "STATUS", "SEMAFORO", "CLASIFICACION"),
                "contacto", List.of("CONTACTO", "ASESOR", "PERSONA"),
                "telefono", List.of("TELEFONO", "TELÉFONO", "CELULAR"),
                "correo", List.of("CORREO", "EMAIL"),
                "notas", List.of("NOTAS", "OBSERVACIONES", "COMENTARIO"),
                "cotizacionesAnual", List.of("COTIZACIONES ANUAL", "COTIZACIONES ANUALES", "COTIZACIONES"),
                "reservasAnual", List.of("RESERVAS ANUAL", "RESERVAS ANUALES", "RESERVAS"),
                "tipologiaRentable", List.of("TIPOLOGIA RENTABLE", "TIPOLOGIA", "TIPOLOGIA B2B"),
                "ticketPromedio", List.of("TICKET PROMEDIO", "TICKET", "TICKET MEDIO"),
                "margenNeto", List.of("MARGEN NETO", "MARGEN", "MARGEN NETO PCT")
        ));
        if (hm.headerIdx < 0) {
            for (List<Object> row : sheet.fullData()) {
                List<String> vals = nonEmpty(row);
                if (vals.size() < 2) {
                    continue;
                }
                if (normalizeHeader(vals.get(0)).equals("AGENCIA")) {
                    continue;
                }
                list.add(new B2bAgenciaDto(
                        vals.get(0),
                        vals.size() > 1 ? vals.get(1) : "",
                        vals.size() > 2 ? vals.get(2) : "",
                        vals.size() > 3 ? vals.get(3) : "",
                        vals.size() > 4 ? vals.get(4) : "",
                        vals.size() > 5 ? vals.get(5) : "",
                        vals.size() > 6 ? vals.get(6) : "",
                        vals.size() > 7 ? vals.get(7) : "",
                        vals.size() > 8 ? vals.get(8) : "",
                        vals.size() > 9 ? vals.get(9) : "",
                        vals.size() > 10 ? vals.get(10) : ""
                ));
            }
            return list;
        }
        for (int i = hm.headerIdx + 1; i < sheet.fullData().size(); i++) {
            List<Object> row = sheet.fullData().get(i);
            String agencia = hm.col(row, "agencia");
            if (agencia.isBlank()) {
                continue;
            }
            list.add(new B2bAgenciaDto(
                    agencia,
                    hm.col(row, "estado"),
                    hm.col(row, "contacto"),
                    hm.col(row, "telefono"),
                    hm.col(row, "correo"),
                    hm.col(row, "notas"),
                    hm.col(row, "cotizacionesAnual"),
                    hm.col(row, "reservasAnual"),
                    hm.col(row, "tipologiaRentable"),
                    hm.col(row, "ticketPromedio"),
                    hm.col(row, "margenNeto")
            ));
        }
        return list;
    }

    /* ===================== Tables ===================== */

    private SheetTableDto toEstadisticasTable(RawSheetDto sheet) {
        if (sheet == null || sheet.fullData() == null || sheet.fullData().isEmpty()) {
            return emptyTable(sheet == null ? "" : sheet.nombre());
        }
        SheetTableDto smart = toSmartTable(sheet, List.of("FECHA", "MES", "SEMANA", "CANAL", "SEMAFORO", "CLIENTE"));
        if (smart.headers().size() >= 3 && !smart.rows().isEmpty()) {
            return smart;
        }
        return buildSyntheticTable(sheet.nombre(), sheet.fullData(), ESTADISTICAS_SYNTHETIC_HEADERS);
    }

    private SheetTableDto toSmartTable(RawSheetDto sheet, List<String> preferTokens) {
        if (sheet == null || sheet.fullData() == null || sheet.fullData().isEmpty()) {
            return emptyTable(sheet == null ? "" : sheet.nombre());
        }
        List<List<Object>> rows = sheet.fullData();
        int headerIdx = findSmartHeaderRow(rows, preferTokens);
        if (headerIdx < 0) {
            headerIdx = 0;
            for (int i = 0; i < Math.min(20, rows.size()); i++) {
                if (nonEmpty(rows.get(i)).size() >= 2) {
                    headerIdx = i;
                    break;
                }
            }
        }
        return buildTableFromHeader(sheet.nombre(), rows, headerIdx);
    }

    private int findSmartHeaderRow(List<List<Object>> rows, List<String> preferTokens) {
        int bestIdx = -1;
        int bestScore = 0;
        for (int i = 0; i < Math.min(30, rows.size()); i++) {
            List<Object> row = rows.get(i);
            int score = 0;
            for (Object cell : row) {
                String h = normalizeHeader(cellStr(cell));
                if (h.isBlank()) {
                    continue;
                }
                for (String token : preferTokens) {
                    String t = normalizeHeader(token);
                    if (h.equals(t) || h.contains(t)) {
                        score += 2;
                    }
                }
                if (h.equals("MES") || h.equals("SEMANA")) {
                    score += 3;
                }
            }
            if (score > bestScore && nonEmpty(row).size() >= 2) {
                bestScore = score;
                bestIdx = i;
            }
        }
        return bestScore >= 2 ? bestIdx : -1;
    }

    private SheetTableDto buildSyntheticTable(String nombre, List<List<Object>> rows, List<String> headers) {
        List<List<String>> outRows = new ArrayList<>();
        for (List<Object> raw : rows) {
            if (raw == null || raw.isEmpty()) {
                continue;
            }
            if (!looksLikeEstadisticasDataRow(raw) && normalizeHeader(cellAt(raw, 0)).equals("FECHA")) {
                continue;
            }
            if (!looksLikeEstadisticasDataRow(raw) && !normalizeHeader(cellAt(raw, 0)).isBlank()
                    && !looksLikeDate(cellAt(raw, 0))) {
                continue;
            }
            List<String> row = new ArrayList<>();
            boolean any = false;
            for (int c = 0; c < headers.size(); c++) {
                String v = cellAt(raw, c);
                if (!v.isBlank()) {
                    any = true;
                }
                row.add(v);
            }
            if (any) {
                outRows.add(row);
            }
        }
        return new SheetTableDto(nombre, new ArrayList<>(headers), outRows);
    }

    private SheetTableDto buildTableFromHeader(String nombre, List<List<Object>> rows, int headerIdx) {
        List<Object> headerRow = rows.get(headerIdx);
        List<String> headers = new ArrayList<>();
        for (int c = 0; c < headerRow.size(); c++) {
            String h = cellStr(headerRow.get(c)).trim();
            headers.add(h.isBlank() ? "Col " + (c + 1) : h);
        }
        trimTrailingEmptyHeaders(headers, rows, headerIdx);
        List<List<String>> outRows = new ArrayList<>();
        for (int i = headerIdx + 1; i < rows.size(); i++) {
            List<Object> raw = rows.get(i);
            List<String> row = new ArrayList<>();
            boolean any = false;
            for (int c = 0; c < headers.size(); c++) {
                String v = cellAt(raw, c);
                if (!v.isBlank()) {
                    any = true;
                }
                row.add(v);
            }
            if (any) {
                outRows.add(row);
            }
        }
        return new SheetTableDto(nombre, headers, outRows);
    }

    private void trimTrailingEmptyHeaders(List<String> headers, List<List<Object>> rows, int headerIdx) {
        while (headers.size() > 1 && headers.get(headers.size() - 1).startsWith("Col ")) {
            boolean allEmpty = true;
            for (int r = headerIdx + 1; r < rows.size(); r++) {
                if (!cellAt(rows.get(r), headers.size() - 1).isBlank()) {
                    allEmpty = false;
                    break;
                }
            }
            if (allEmpty) {
                headers.remove(headers.size() - 1);
            } else {
                break;
            }
        }
    }

    private SheetTableDto emptyTable(String nombre) {
        return new SheetTableDto(nombre == null ? "" : nombre, List.of(), List.of());
    }

    /* ===================== Aggregations ===================== */

    private SheetsKpisDto buildKpis(List<SeguimientoWhatsappDto> seguimiento) {
        long totalContactos = seguimiento.size();
        long totalVentas = seguimiento.stream()
                .filter(r -> "VENTA".equalsIgnoreCase(blank(r.semaforo())))
                .count();
        long totalConEncuesta = seguimiento.stream().filter(SeguimientoWhatsappDto::encuesta).count();
        long totalTibioCaliente = seguimiento.stream().filter(r -> {
            String s = blank(r.semaforo()).toUpperCase(Locale.ROOT);
            return s.contains("TIBIO") || s.contains("CALIENTE");
        }).count();
        double tasa = totalContactos > 0
                ? Math.round((totalVentas * 10000.0) / totalContactos) / 100.0
                : 0.0;
        return new SheetsKpisDto(totalContactos, totalVentas, tasa, totalConEncuesta, totalTibioCaliente);
    }

    private List<NamedCountDto> aggregateByMonth(List<SeguimientoWhatsappDto> rows) {
        Map<String, Long> counts = new TreeMap<>();
        for (SeguimientoWhatsappDto row : rows) {
            String mes = monthKey(row.fecha());
            if (mes == null) {
                continue;
            }
            counts.merge(mes, 1L, Long::sum);
        }
        return counts.entrySet().stream()
                .map(e -> new NamedCountDto(e.getKey(), e.getValue()))
                .toList();
    }

    private List<MonthlyPointDto> buildEvolucion(List<SeguimientoWhatsappDto> rows) {
        Map<String, long[]> byMes = new TreeMap<>();
        for (SeguimientoWhatsappDto row : rows) {
            String mes = monthKey(row.fecha());
            if (mes == null) {
                continue;
            }
            long[] pair = byMes.computeIfAbsent(mes, k -> new long[2]);
            pair[0]++;
            if ("VENTA".equalsIgnoreCase(blank(row.semaforo()))) {
                pair[1]++;
            }
        }
        List<MonthlyPointDto> list = new ArrayList<>();
        byMes.forEach((mes, pair) -> list.add(new MonthlyPointDto(mes, pair[0], pair[1])));
        return list;
    }

    private List<SheetSummaryDto> mapHojas(List<RawSheetDto> rawSheets, List<SeguimientoWhatsappDto> seguimiento) {
        Map<String, Long> byHoja = new HashMap<>();
        for (SeguimientoWhatsappDto row : seguimiento) {
            String hoja = blank(row.hojaOrigen()).isBlank() ? "seguimiento" : row.hojaOrigen();
            byHoja.merge(hoja, 1L, Long::sum);
        }
        List<SheetSummaryDto> list = new ArrayList<>();
        for (RawSheetDto sheet : rawSheets) {
            long typed = byHoja.getOrDefault(sheet.nombre(), 0L);
            String preview = previewFromMatrix(sheet.fullData());
            String estado;
            if (typed > 0) {
                estado = "TIPADA";
                preview = typed + " seguimientos tipados · " + sheet.rawRowCount() + " filas raw";
            } else if (sheet.rawRowCount() > 0 || (sheet.fullData() != null && !sheet.fullData().isEmpty())) {
                estado = "RAW";
            } else {
                estado = "VACIA";
            }
            list.add(new SheetSummaryDto(sheet.nombre(), sheet.rawRowCount(), preview, estado));
        }
        list.sort(Comparator.comparing(SheetSummaryDto::nombre, String.CASE_INSENSITIVE_ORDER));
        return list;
    }

    private String previewFromMatrix(List<List<Object>> rows) {
        if (rows == null) {
            return "";
        }
        for (List<Object> row : rows) {
            StringBuilder sb = new StringBuilder();
            for (Object cell : row) {
                String t = cellStr(cell).trim();
                if (!t.isBlank()) {
                    if (!sb.isEmpty()) {
                        sb.append(" · ");
                    }
                    sb.append(t);
                }
            }
            if (!sb.isEmpty()) {
                String out = sb.toString();
                return out.length() > 160 ? out.substring(0, 157) + "..." : out;
            }
        }
        return "";
    }

    private List<NamedCountDto> aggregate(
            List<SeguimientoWhatsappDto> rows,
            java.util.function.Function<SeguimientoWhatsappDto, String> keyFn
    ) {
        Map<String, Long> counts = new HashMap<>();
        for (SeguimientoWhatsappDto row : rows) {
            String key = keyFn.apply(row);
            if (key == null || key.isBlank()) {
                key = "SIN_DATO";
            }
            counts.merge(key.trim(), 1L, Long::sum);
        }
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> new NamedCountDto(e.getKey(), e.getValue()))
                .toList();
    }

    /* ===================== Helpers ===================== */

    @SafeVarargs
    private static Map<String, List<String>> aliasMap(Object... keyAndLists) {
        Map<String, List<String>> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keyAndLists.length; i += 2) {
            @SuppressWarnings("unchecked")
            List<String> aliases = (List<String>) keyAndLists[i + 1];
            map.put(String.valueOf(keyAndLists[i]), aliases);
        }
        return map;
    }

    private HeaderMap detectHeader(List<List<Object>> rows, Map<String, List<String>> fieldAliases) {
        HeaderMap hm = new HeaderMap();
        if (rows == null) {
            return hm;
        }
        for (int i = 0; i < Math.min(30, rows.size()); i++) {
            List<Object> row = rows.get(i);
            Map<String, Integer> cols = new HashMap<>();
            for (int c = 0; c < row.size(); c++) {
                String h = normalizeHeader(cellStr(row.get(c)));
                if (h.isBlank()) {
                    continue;
                }
                for (Map.Entry<String, List<String>> entry : fieldAliases.entrySet()) {
                    for (String alias : entry.getValue()) {
                        if (headerMatches(h, alias)) {
                            cols.putIfAbsent(entry.getKey(), c);
                        }
                    }
                }
            }
            if (cols.size() >= 2) {
                hm.headerIdx = i;
                hm.cols = cols;
                return hm;
            }
        }
        return hm;
    }

    private static final class HeaderMap {
        int headerIdx = -1;
        Map<String, Integer> cols = Map.of();

        String col(List<Object> row, String key) {
            Integer idx = cols.get(key);
            if (idx == null) {
                return "";
            }
            return cellAt(row, idx);
        }
    }

    private List<String> readStringArray(JsonNode node) {
        if (!node.isArray()) {
            return new ArrayList<>();
        }
        List<String> list = new ArrayList<>();
        for (JsonNode item : node) {
            String v = item.asText("").trim();
            if (!v.isBlank()) {
                list.add(v);
            }
        }
        return list;
    }

    private static String col(List<Object> row, Map<String, Integer> cols, String key) {
        Integer idx = cols.get(key);
        if (idx == null) {
            return "";
        }
        return cellAt(row, idx);
    }

    private static String cellAt(List<Object> row, int idx) {
        if (row == null || idx < 0 || idx >= row.size()) {
            return "";
        }
        return cellStr(row.get(idx)).trim();
    }

    private static String cellStr(Object cell) {
        if (cell == null) {
            return "";
        }
        return String.valueOf(cell);
    }

    private static List<String> nonEmpty(List<Object> row) {
        List<String> vals = new ArrayList<>();
        if (row == null) {
            return vals;
        }
        for (Object cell : row) {
            String s = cellStr(cell).trim();
            if (!s.isBlank()) {
                vals.add(s);
            }
        }
        return vals;
    }

    private static boolean asBool(String value) {
        if (value == null) {
            return false;
        }
        String v = value.trim().toUpperCase(Locale.ROOT);
        return v.equals("SI") || v.equals("SÍ") || v.equals("YES") || v.equals("TRUE") || v.equals("1") || v.equals("X");
    }

    private static long asLong(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            String cleaned = value.replaceAll("[^0-9.\\-]", "");
            if (cleaned.isBlank()) {
                return 0;
            }
            if (cleaned.contains(".")) {
                return (long) Double.parseDouble(cleaned);
            }
            return Long.parseLong(cleaned);
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private static String normalizeSemaforo(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String v = value.trim().toUpperCase(Locale.ROOT);
        v = v.replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U");
        if (v.contains("VENTA")) {
            return "VENTA";
        }
        if (v.contains("CALIENTE")) {
            return "CALIENTE";
        }
        if (v.contains("TIBIO")) {
            return "TIBIO";
        }
        if (v.contains("FRIO") || v.contains("FRÍO")) {
            return "FRIO";
        }
        return v;
    }

    private static String normalizeDate(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String v = value.trim();
        if (v.length() >= 10 && v.charAt(4) == '-' && v.charAt(7) == '-') {
            return v.substring(0, 10);
        }
        if (v.endsWith("Z") || v.contains("T")) {
            try {
                return Instant.parse(v).atZone(ZoneOffset.UTC).toLocalDate().toString();
            } catch (DateTimeParseException ignored) {
                // fall through
            }
        }
        try {
            return LocalDate.parse(v).toString();
        } catch (DateTimeParseException ignored) {
            return v;
        }
    }

    private static boolean looksLikeDate(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String v = value.trim();
        if (v.length() >= 10 && v.charAt(4) == '-' && Character.isDigit(v.charAt(0))) {
            return true;
        }
        if (v.contains("T") && v.length() >= 10 && Character.isDigit(v.charAt(0))) {
            return true;
        }
        if (v.matches("\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}")) {
            return true;
        }
        String d = normalizeDate(value);
        if (d.length() >= 10) {
            try {
                LocalDate.parse(d.substring(0, 10));
                return true;
            } catch (DateTimeParseException ignored) {
                return false;
            }
        }
        return false;
    }

    private static String monthKey(String fecha) {
        String d = normalizeDate(fecha);
        if (d == null || d.length() < 7) {
            return null;
        }
        try {
            if (d.length() >= 10) {
                return YearMonth.from(LocalDate.parse(d.substring(0, 10))).format(YM);
            }
            return YearMonth.parse(d.substring(0, 7)).format(YM);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String normalizeHeader(String value) {
        if (value == null) {
            return "";
        }
        String v = value.trim().toUpperCase(Locale.ROOT);
        return v
                .replace("Á", "A").replace("É", "E").replace("Í", "I")
                .replace("Ó", "O").replace("Ú", "U").replace("Ñ", "N")
                .replaceAll("\\s+", " ");
    }

    private static String normalizeKey(String value) {
        return normalizeHeader(value).replaceAll("[^A-Z0-9]", "");
    }

    private boolean isGarbagePais(String pais) {
        String p = normalizeHeader(pais);
        return p.equals("PAIS") || p.equals("ENERO") || p.equals("TOTAL")
                || p.equals("CODIGO") || p.equals("CANTIDAD") || p.equals("Z")
                || p.matches("\\d+") || p.length() < 3;
    }

    private static BigDecimal parseMoney(String raw) {
        if (raw == null || raw.isBlank()) {
            return BigDecimal.ZERO;
        }
        return extractMoney(raw);
    }

    /** Matching estricto: evita que "CLIENTE" capture "TIPO DE CLIENTE" o "FECHA" capture "FECHA SERVICIO". */
    private static boolean headerMatches(String header, String alias) {
        String h = normalizeHeader(header);
        String a = normalizeHeader(alias);
        if (h.isBlank() || a.isBlank()) {
            return false;
        }
        if (h.equals(a)) {
            return true;
        }
        String hk = normalizeKey(h);
        String ak = normalizeKey(a);
        if (hk.equals(ak)) {
            return true;
        }
        // Alias largo: el encabezado puede ser más específico ("SOPORTE EN DRIVE")
        if (ak.length() >= 6 && hk.startsWith(ak)) {
            return true;
        }
        if (a.length() >= 10 && h.startsWith(a)) {
            return true;
        }
        return false;
    }

    private static BigDecimal extractMoney(String text) {
        if (text == null || text.isBlank()) {
            return BigDecimal.ZERO;
        }
        // Priorizar montos con $ o separadores de miles
        java.util.regex.Matcher moneyLike = Pattern.compile(
                "\\$\\s*(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{2})?|\\d+[.,]\\d{2}|\\d{4,})"
        ).matcher(text);
        BigDecimal best = BigDecimal.ZERO;
        while (moneyLike.find()) {
            BigDecimal value = sanitizeMoneyToken(moneyLike.group(1));
            if (value.compareTo(best) > 0) {
                best = value;
            }
        }
        if (best.signum() > 0) {
            return best.setScale(2, RoundingMode.HALF_UP);
        }
        java.util.regex.Matcher matcher = Pattern.compile(
                "(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{2})?|\\d+[.,]\\d{2})"
        ).matcher(text);
        while (matcher.find()) {
            BigDecimal value = sanitizeMoneyToken(matcher.group(1));
            if (value.compareTo(best) > 0) {
                best = value;
            }
        }
        if (best.compareTo(BigDecimal.valueOf(10_000)) < 0) {
            return BigDecimal.ZERO;
        }
        return best.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal sanitizeMoneyToken(String token) {
        if (token == null || token.isBlank()) {
            return BigDecimal.ZERO;
        }
        String raw = token.trim();
        // Años y códigos tipo ddmmyyyy / yyyymmdd
        if (raw.matches("19\\d{2}|20\\d{2}") || raw.matches("\\d{8}")) {
            return BigDecimal.ZERO;
        }
        BigDecimal value = toBigDecimal(raw);
        if (value.compareTo(BigDecimal.valueOf(10_000)) < 0) {
            return BigDecimal.ZERO;
        }
        // Evitar códigos enormes poco realistas como montos de tour
        if (value.compareTo(BigDecimal.valueOf(500_000_000L)) > 0) {
            return BigDecimal.ZERO;
        }
        return value;
    }

    private static BigDecimal toBigDecimal(String token) {
        String t = token.trim();
        try {
            if (t.matches("\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?")) {
                // 1.260.000,50
                t = t.replace(".", "").replace(",", ".");
            } else if (t.matches("\\d{1,3}(,\\d{3})+(\\.\\d{1,2})?")) {
                // 1,260,000.50
                t = t.replace(",", "");
            } else if (t.contains(",") && !t.contains(".")) {
                t = t.replace(",", ".");
            }
            return new BigDecimal(t);
        } catch (Exception ex) {
            return BigDecimal.ZERO;
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return "";
        }
        return value.asText("").trim();
    }

    private static String blank(String value) {
        return value == null ? "" : value.trim();
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        if (b != null && !b.isBlank()) {
            return b;
        }
        return "";
    }
}
