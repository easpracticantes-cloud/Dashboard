/**
 * GOOGLE SHEETS WEB APP — SIG-EAS (LECTURA + ESCRITURA)
 * =====================================================
 * Usa ESTE archivo en Apps Script (un solo proyecto).
 *
 * - doGet  → dashboard / sync (hojasProcesadas + data[hoja].fullData)
 * - doPost → ping | updateRow | appendRow | deleteRow
 *
 * NO publiques solo google_sheets_webapp_write.gs: sin doGet el SIG
 * deja de leer las hojas.
 *
 * Deploy: Nueva implementación → Aplicación web → Yo / Cualquiera
 * Copiar /exec a GOOGLE_SHEETS_WEBAPP_URL y recrear backend.
 */

/**
 * ============================================================
 * GOOGLE SHEETS WEB APP — SIG-EAS
 * Lectura + Escritura
 * ============================================================
 *
 * GET:
 *   Lee toda la información existente del Spreadsheet.
 *
 * POST:
 *   - ping
 *   - updateRow
 *   - appendRow
 *   - deleteRow
 *
 * ============================================================
 * CONFIGURACIÓN
 * ============================================================
 *
 * 1. Extensiones → Apps Script
 * 2. Reemplazar/fusionar este código con el proyecto actual.
 * 3. En:
 *      Configuración del proyecto
 *      → Propiedades del script
 *
 *    Crear:
 *
 *      SHEETS_WRITE_TOKEN = un secreto largo
 *
 * 4. El mismo token debe estar configurado en el backend:
 *
 *      GOOGLE_SHEETS_WRITE_TOKEN
 *
 * 5. Implementar → Nueva implementación
 *      Tipo: Aplicación web
 *      Ejecutar como: Yo
 *      Quién tiene acceso: Cualquiera
 *
 * 6. Mantener la misma URL /exec que utiliza actualmente SIG-EAS.
 *
 * ============================================================
 */

/**
 * ============================================================
 * GET
 * ============================================================
 *
 * Mantiene la lectura existente del sistema.
 *
 * GET /exec
 *
 * Devuelve todas las hojas y sus datos en JSON.
 */
function doGet(e) {
  try {
    const data = extraerAbsolutamenteTodo();

    return ContentService
      .createTextOutput(JSON.stringify(data, null, 2))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {

    console.error(error);

    return ContentService
      .createTextOutput(JSON.stringify({
        error: error.message,
        detail: "Revisa logs para más información"
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ============================================================
 * POST
 * ============================================================
 *
 * Acciones soportadas:
 *
 * {
 *   "action": "ping",
 *   "token": "..."
 * }
 *
 * {
 *   "action": "updateRow",
 *   "sheetName": "ENE",
 *   "match": {
 *      "celular": "...",
 *      "fecha": "...",
 *      "cliente": "..."
 *   },
 *   "fields": {
 *      "SEMAFORO": "CALIENTE",
 *      "NOTAS": "..."
 *   },
 *   "token": "..."
 * }
 *
 * {
 *   "action": "appendRow",
 *   "sheetName": "VENTAS",
 *   "fields": {
 *      "NOMBRE": "...",
 *      "CELULAR": "..."
 *   },
 *   "token": "..."
 * }
 *
 * {
 *   "action": "deleteRow",
 *   "sheetName": "ENE",
 *   "match": {
 *      "celular": "...",
 *      "fecha": "...",
 *      "cliente": "..."
 *   },
 *   "token": "..."
 * }
 */
function doPost(e) {

  try {

    var body = {};

    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    /**
     * Validar token antes de cualquier operación
     */
    if (!verifyWriteToken_(body.token)) {

      return json_({
        ok: false,
        error: 'Token de escritura inválido'
      });
    }

    var action = String(body.action || '').toLowerCase();

    /**
     * --------------------------------------------------------
     * PING
     * --------------------------------------------------------
     */
    if (action === 'ping') {

      return json_({
        ok: true,
        message: 'write-ready'
      });
    }

    /**
     * --------------------------------------------------------
     * ACTUALIZAR FILA
     * --------------------------------------------------------
     */
    if (action === 'updaterow') {

      return json_(updateRow_(body));
    }

    /**
     * --------------------------------------------------------
     * AGREGAR FILA
     * --------------------------------------------------------
     */
    if (action === 'appendrow') {

      return json_(appendRow_(body));
    }

    /**
     * --------------------------------------------------------
     * ELIMINAR FILA
     * --------------------------------------------------------
     */
    if (action === 'deleterow') {

      return json_(deleteRow_(body));
    }

    /**
     * --------------------------------------------------------
     * ACCIÓN NO SOPORTADA
     * --------------------------------------------------------
     */
    return json_({
      ok: false,
      error: 'Acción no soportada: ' + action
    });

  } catch (err) {

    return json_({
      ok: false,
      error: String(
        err && err.message
          ? err.message
          : err
      )
    });
  }
}

/**
 * ============================================================
 * TOKEN DE ESCRITURA
 * ============================================================
 */
function verifyWriteToken_(token) {

  var expected =
    PropertiesService
      .getScriptProperties()
      .getProperty('SHEETS_WRITE_TOKEN');

  /**
   * Si no existe token configurado,
   * actualmente permite escritura.
   *
   * IMPORTANTE:
   * Para producción es recomendable configurar
   * SHEETS_WRITE_TOKEN.
   */
  if (!expected || !String(expected).trim()) {

    return true;
  }

  return String(token || '') === String(expected);
}

/**
 * ============================================================
 * UPDATE ROW
 * ============================================================
 */
function updateRow_(body) {

  var sheetName =
    String(body.sheetName || '').trim();

  if (!sheetName) {

    return {
      ok: false,
      error: 'sheetName requerido'
    };
  }

  var ss =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {

    return {
      ok: false,
      error: 'Hoja no encontrada: ' + sheetName
    };
  }

  var values =
    sheet.getDataRange().getValues();

  if (!values.length) {

    return {
      ok: false,
      error: 'Hoja vacía'
    };
  }

  var headerInfo =
    findHeaderRow_(values);

  if (headerInfo.idx < 0) {

    return {
      ok: false,
      error: 'No se detectó fila de encabezados'
    };
  }

  var headers =
    headerInfo.headers;

  var match =
    body.match || {};

  var rowIndex =
    findMatchingRow_(
      values,
      headerInfo.idx,
      headers,
      match
    );

  if (rowIndex < 0) {

    return {
      ok: false,
      error: 'Fila no encontrada con los criterios de match',
      match: match
    };
  }

  var fields =
    body.fields || {};

  var updated = [];

  Object.keys(fields).forEach(function (key) {

    var col =
      findColumn_(headers, key);

    if (col >= 0) {

      sheet
        .getRange(
          rowIndex + 1,
          col + 1
        )
        .setValue(fields[key]);

      updated.push(key);
    }
  });

  return {

    ok: true,

    sheetName: sheetName,

    rowNumber: rowIndex + 1,

    updatedFields: updated
  };
}

/**
 * ============================================================
 * APPEND ROW
 * ============================================================
 */
function appendRow_(body) {

  var sheetName =
    String(body.sheetName || '').trim();

  if (!sheetName) {

    return {
      ok: false,
      error: 'sheetName requerido'
    };
  }

  var ss =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {

    return {
      ok: false,
      error: 'Hoja no encontrada: ' + sheetName
    };
  }

  var values =
    sheet.getDataRange().getValues();

  var headerInfo =
    findHeaderRow_(values);

  if (headerInfo.idx < 0) {

    return {
      ok: false,
      error: 'No se detectó fila de encabezados'
    };
  }

  var headers =
    headerInfo.headers;

  var fields =
    body.fields || {};

  var row =
    headers.map(function (h) {

      var v =
        pickField_(fields, h);

      return v === undefined
        ? ''
        : v;
    });

  sheet.appendRow(row);

  return {

    ok: true,

    sheetName: sheetName,

    rowNumber: sheet.getLastRow(),

    appended: true
  };
}

/**
 * ============================================================
 * DELETE ROW
 * ============================================================
 *
 * Esta es la función nueva para el botón "Eliminar"
 * del módulo Registro.
 */
function deleteRow_(body) {

  var sheetName =
    String(body.sheetName || '').trim();

  if (!sheetName) {

    return {
      ok: false,
      error: 'sheetName requerido'
    };
  }

  var ss =
    SpreadsheetApp.getActiveSpreadsheet();

  var sheet =
    ss.getSheetByName(sheetName);

  if (!sheet) {

    return {
      ok: false,
      error: 'Hoja no encontrada: ' + sheetName
    };
  }

  var values =
    sheet.getDataRange().getValues();

  if (!values.length) {

    return {
      ok: false,
      error: 'Hoja vacía'
    };
  }

  var headerInfo =
    findHeaderRow_(values);

  if (headerInfo.idx < 0) {

    return {
      ok: false,
      error: 'No se detectó fila de encabezados'
    };
  }

  var match =
    body.match || {};

  var rowIndex =
    findMatchingRow_(
      values,
      headerInfo.idx,
      headerInfo.headers,
      match
    );

  if (rowIndex < 0) {

    return {

      ok: false,

      error:
        'Fila no encontrada con los criterios de match',

      match: match
    };
  }

  /**
   * Seguridad adicional:
   * nunca eliminar la fila de encabezados.
   */
  if (rowIndex <= headerInfo.idx) {

    return {

      ok: false,

      error:
        'No se puede eliminar la fila de encabezados'
    };
  }

  /**
   * Eliminar la fila encontrada.
   */
  sheet.deleteRow(rowIndex + 1);

  return {

    ok: true,

    sheetName: sheetName,

    rowNumber: rowIndex + 1,

    deleted: true,

    message: 'Fila eliminada'
  };
}

/**
 * ============================================================
 * EXTRAER ABSOLUTAMENTE TODO
 * ============================================================
 *
 * Mantiene la funcionalidad de lectura existente.
 */
function extraerAbsolutamenteTodo() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const allSheets =
    ss.getSheets();

  const result = {

    ultimaActualizacion:
      new Date().toISOString(),

    hojasProcesadas:
      allSheets.map(
        s => s.getName()
      ),

    totalHojas:
      allSheets.length,

    data: {}
  };

  allSheets.forEach(sheet => {

    const name =
      sheet.getName().trim();

    const values =
      sheet.getDataRange().getValues();

    /**
     * Guardamos todo crudo
     * + intento de estructurar.
     */
    result.data[name] = {

      rawRowCount:
        values.length,

      firstFewRows:
        values.slice(0, 5),

      fullData:
        values
    };

    /**
     * --------------------------------------------------------
     * SEGUIMIENTO 2025
     * --------------------------------------------------------
     */
    if (
      name.includes("ENE- FEB- MAR 2025") ||
      name.includes("2025")
    ) {

      result.data.seguimiento2025 =
        extraerSeguimiento(values);
    }

    /**
     * --------------------------------------------------------
     * SEGUIMIENTO 2026
     * --------------------------------------------------------
     */
    if (name.includes("2026")) {

      result.data.seguimiento2026 =
        extraerSeguimiento(values);
    }

    /**
     * --------------------------------------------------------
     * PAÍSES
     * --------------------------------------------------------
     */
    if (name.includes("PAÍSES")) {

      result.data.paises =
        extraerPaises(values);
    }

    /**
     * --------------------------------------------------------
     * B2B
     * --------------------------------------------------------
     */
    if (
      name.includes("PLAN COMERCIAL") ||
      name.includes("B2B")
    ) {

      result.data.b2b =
        extraerB2BFull(values);
    }

    /**
     * --------------------------------------------------------
     * PIEZAS PUBLICITARIAS
     * --------------------------------------------------------
     */
    if (name.includes("PIEZAS PUB")) {

      result.data.piezasPub =
        values;
    }

    /**
     * --------------------------------------------------------
     * TOQUES
     * --------------------------------------------------------
     */
    if (name.includes("TOQUES")) {

      result.data.toques =
        values;
    }

    /**
     * --------------------------------------------------------
     * ESTADÍSTICAS / VENTAS
     * --------------------------------------------------------
     */
    if (
      name.includes("ESTADISTICAS") ||
      name.includes("VENTAS")
    ) {

      result.data.estadisticasYVentas =
        values;
    }

  });

  return result;
}

/**
 * ============================================================
 * EXTRAER SEGUIMIENTO
 * ============================================================
 */
function extraerSeguimiento(values) {

  const data = [];

  for (
    let i = 3;
    i < values.length;
    i++
  ) {

    const r =
      values[i];

    if (!r[0]) {
      continue;
    }

    data.push(r);
  }

  return data;
}

/**
 * ============================================================
 * EXTRAER PAÍSES
 * ============================================================
 */
function extraerPaises(values) {

  return values
    .slice(1)
    .map(r => r);
}

/**
 * ============================================================
 * EXTRAER B2B
 * ============================================================
 */
function extraerB2BFull(values) {

  return values
    .slice(1)
    .map(r => r);
}

/**
 * ============================================================
 * BUSCAR FILA DE ENCABEZADOS
 * ============================================================
 */
function findHeaderRow_(values) {

  var bestIdx = -1;

  var bestHeaders = [];

  var bestScore = 0;

  for (
    var i = 0;
    i < Math.min(values.length, 40);
    i++
  ) {

    var row =
      values[i];

    var headers =
      row.map(function (c) {

        return normalizeHeader_(c);
      });

    var score = 0;

    headers.forEach(function (h) {

      if (!h) {
        return;
      }

      if (
        h.indexOf('FECHA') >= 0 ||
        h.indexOf('CELULAR') >= 0 ||
        h.indexOf('CLIENTE') >= 0 ||
        h.indexOf('NOMBRE') >= 0 ||
        h.indexOf('SEMAFORO') >= 0 ||
        h.indexOf('CANAL') >= 0 ||
        h.indexOf('VENTA') >= 0 ||
        h.indexOf('SERVICIO') >= 0
      ) {

        score++;
      }

    });

    if (score > bestScore) {

      bestScore =
        score;

      bestIdx =
        i;

      bestHeaders =
        headers;
    }
  }

  return {

    idx:
      bestScore >= 2
        ? bestIdx
        : (values.length ? 0 : -1),

    headers:
      bestHeaders.length
        ? bestHeaders
        : (
            values[0] || []
          ).map(normalizeHeader_)
  };
}

/**
 * ============================================================
 * BUSCAR FILA COINCIDENTE
 * ============================================================
 */
function findMatchingRow_(
  values,
  headerIdx,
  headers,
  match
) {

  var colCel =
    findColumn_(headers, 'CELULAR') >= 0
      ? findColumn_(headers, 'CELULAR')
      : (
          findColumn_(headers, 'TELEFONO') >= 0
            ? findColumn_(headers, 'TELEFONO')
            : findColumn_(headers, 'WHATSAPP')
        );

  var colFecha =
    findColumn_(headers, 'FECHA');

  if (colFecha < 0) {

    colFecha =
      findColumn_(headers, 'FECHA COT');
  }

  var colCliente =
    findColumn_(headers, 'CLIENTE');

  if (colCliente < 0) {

    colCliente =
      findColumn_(headers, 'NOMBRE');
  }

  var wantCel =
    digits_(
      match.celular ||
      match.phone ||
      ''
    );

  var wantFecha =
    normalizeDate_(
      match.fecha ||
      match.date ||
      ''
    );

  var wantCliente =
    normalizeHeader_(
      match.cliente ||
      match.nombre ||
      ''
    );

  /**
   * Primera búsqueda:
   * celular + fecha + cliente
   */
  for (
    var r = headerIdx + 1;
    r < values.length;
    r++
  ) {

    var row =
      values[r];

    var cel =
      colCel >= 0
        ? digits_(row[colCel])
        : '';

    var fecha =
      colFecha >= 0
        ? normalizeDate_(row[colFecha])
        : '';

    var cliente =
      colCliente >= 0
        ? normalizeHeader_(row[colCliente])
        : '';

    var okCel =
      !wantCel ||
      (
        cel &&
        (
          cel === wantCel ||
          cel.endsWith(wantCel) ||
          wantCel.endsWith(cel)
        )
      );

    var okFecha =
      !wantFecha ||
      (
        fecha &&
        (
          fecha === wantFecha ||
          fecha.indexOf(wantFecha) === 0 ||
          wantFecha.indexOf(fecha) === 0
        )
      );

    var okCliente =
      !wantCliente ||
      (
        cliente &&
        cliente === wantCliente
      );

    if (
      okCel &&
      okFecha &&
      okCliente
    ) {

      if (
        wantCel ||
        wantFecha ||
        wantCliente
      ) {

        return r;
      }
    }
  }

  /**
   * Fallback:
   * buscar únicamente por celular.
   *
   * Se recorre desde abajo para encontrar
   * la última ocurrencia.
   */
  if (wantCel) {

    for (
      var r2 = values.length - 1;
      r2 > headerIdx;
      r2--
    ) {

      var cel2 =
        colCel >= 0
          ? digits_(values[r2][colCel])
          : '';

      if (
        cel2 &&
        (
          cel2 === wantCel ||
          cel2.endsWith(wantCel) ||
          wantCel.endsWith(cel2)
        )
      ) {

        return r2;
      }
    }
  }

  return -1;
}

/**
 * ============================================================
 * BUSCAR COLUMNA
 * ============================================================
 */
function findColumn_(headers, key) {

  var target =
    normalizeHeader_(key);

  var i;

  /**
   * Coincidencia exacta.
   */
  for (
    i = 0;
    i < headers.length;
    i++
  ) {

    if (
      headers[i] === target
    ) {

      return i;
    }
  }

  /**
   * Coincidencia parcial.
   */
  for (
    i = 0;
    i < headers.length;
    i++
  ) {

    var h =
      headers[i];

    if (
      h &&
      h.indexOf(target) >= 0
    ) {

      return i;
    }
  }

  /**
   * Alias.
   */
  var aliases = {

    'CELULAR': [
      'TELEFONO',
      'WHATSAPP',
      'PHONE'
    ],

    'CLIENTE': [
      'NOMBRE',
      'NAME'
    ],

    'SEMAFORO': [
      'STATUS',
      'ESTADO'
    ],

    'NOTAS': [
      'NOTA',
      'OBSERVACIONES',
      'COMENTARIOS'
    ],

    'PROXIMO SEGUIMIENTO': [
      'PROXIMO',
      'PROX SEGUIMIENTO',
      'FECHA PROXIMO SEGUIMIENTO'
    ],

    'FECHA PROXIMO SEGUIMIENTO': [
      'PROXIMO SEGUIMIENTO',
      'PROXIMO'
    ],

    'FECHA SERVICIO': [
      'FECHASERVICIO'
    ],

    'FECHA COTIZADO': [
      'FECHA COTIZACION',
      'FECHA DE COTIZACION'
    ],

    'OBJECION': [
      'OBJECCION'
    ],

    'PRIORIZAR': [
      'PRIORIDAD'
    ],

    'PRIORIDAD': [
      'PRIORIZAR'
    ],

    'REGISTRADO': [
      'REGISTRADA'
    ],

    'REGISTRADA': [
      'REGISTRADO'
    ],

    'COTIZADO': [
      'COTIZACION'
    ]
  };

  var list =
    aliases[target] || [];

  for (
    var a = 0;
    a < list.length;
    a++
  ) {

    for (
      var j = 0;
      j < headers.length;
      j++
    ) {

      if (
        headers[j] === list[a]
      ) {

        return j;
      }
    }

    for (
      var k = 0;
      k < headers.length;
      k++
    ) {

      if (
        headers[k] &&
        headers[k].indexOf(list[a]) >= 0
      ) {

        return k;
      }
    }
  }

  return -1;
}

/**
 * ============================================================
 * OBTENER CAMPO
 * ============================================================
 */
function pickField_(fields, header) {

  if (!fields) {
    return undefined;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      fields,
      header
    )
  ) {

    return fields[header];
  }

  var keys =
    Object.keys(fields);

  for (
    var i = 0;
    i < keys.length;
    i++
  ) {

    if (
      normalizeHeader_(keys[i]) === header
    ) {

      return fields[keys[i]];
    }
  }

  return undefined;
}

/**
 * ============================================================
 * NORMALIZAR ENCABEZADOS
 * ============================================================
 */
function normalizeHeader_(v) {

  return String(
    v == null ? '' : v
  )
    .toUpperCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^A-Z0-9]+/g,
      ' '
    )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}

/**
 * ============================================================
 * DEJAR SOLO DÍGITOS
 * ============================================================
 */
function digits_(v) {

  return String(
    v == null ? '' : v
  ).replace(
    /\D+/g,
    ''
  );
}

/**
 * ============================================================
 * NORMALIZAR FECHA
 * ============================================================
 */
function normalizeDate_(v) {

  /**
   * Si ya es Date.
   */
  if (v instanceof Date) {

    return Utilities.formatDate(
      v,
      Session.getScriptTimeZone() ||
        'America/Bogota',
      'yyyy-MM-dd'
    );
  }

  var s =
    String(
      v == null ? '' : v
    ).trim();

  if (!s) {
    return '';
  }

  /**
   * Excel serial.
   */
  if (
    /^\d+(\.\d+)?$/.test(s)
  ) {

    var n =
      Number(s);

    if (
      n > 20000 &&
      n < 80000
    ) {

      var epoch =
        new Date(
          Date.UTC(
            1899,
            11,
            30
          )
        );

      var d =
        new Date(
          epoch.getTime() +
          n * 86400000
        );

      return Utilities.formatDate(
        d,
        'UTC',
        'yyyy-MM-dd'
      );
    }
  }

  /**
   * yyyy-mm-dd
   */
  var m =
    s.match(
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
    );

  if (m) {

    return (
      m[1] +
      '-' +
      ('0' + m[2]).slice(-2) +
      '-' +
      ('0' + m[3]).slice(-2)
    );
  }

  /**
   * dd-mm-yyyy / dd/mm/yyyy
   */
  var m2 =
    s.match(
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/
    );

  if (m2) {

    var y =
      m2[3].length === 2
        ? ('20' + m2[3])
        : m2[3];

    return (
      y +
      '-' +
      ('0' + m2[2]).slice(-2) +
      '-' +
      ('0' + m2[1]).slice(-2)
    );
  }

  return s.substring(0, 10);
}

/**
 * ============================================================
 * RESPUESTA JSON
 * ============================================================
 */
function json_(obj) {

  return ContentService

    .createTextOutput(
      JSON.stringify(obj)
    )

    .setMimeType(
      ContentService.MimeType.JSON
    );
}
