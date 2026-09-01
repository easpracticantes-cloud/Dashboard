/**
 * Google Sheets Web App — escritura desde SIG
 * =====================================================
 * CÓMO ACTIVAR (obligatorio para que "Guardar" en la web actualice Sheets):
 *
 * 1. Abre el Apps Script del spreadsheet (Extensiones → Apps Script).
 * 2. Pega ESTE archivo COMPLETO al final del proyecto (o fusiona doPost
 *    con tu script actual si ya tienes doGet).
 * 3. En Propiedades del script (⚙️ → Propiedades del proyecto) agrega opcional:
 *      SHEETS_WRITE_TOKEN = un secreto largo
 *    El mismo valor va en Render como GOOGLE_SHEETS_WRITE_TOKEN.
 * 4. Implementar → Nueva implementación → Tipo: Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copia la URL /exec a integrations.googleSheets.webAppUrl (o GOOGLE_SHEETS_WEBAPP_URL).
 *
 * Acciones POST (JSON body):
 *   { "action": "updateRow", "sheetName": "ENE", "match": { "celular": "...", "fecha": "..." }, "fields": { "SEMAFORO": "CALIENTE", "NOTAS": "..." }, "token": "..." }
 *   { "action": "appendRow", "sheetName": "VENTAS", "fields": { "NOMBRE": "...", "CELULAR": "..." }, "token": "..." }
 *   { "action": "ping", "token": "..." }
 *
 * Si ya tienes doGet para el dashboard, NO lo borres. Solo agrega doPost + helpers.
 */

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    if (!verifyWriteToken_(body.token)) {
      return json_({ ok: false, error: 'Token de escritura inválido' });
    }
    var action = String(body.action || '').toLowerCase();
    if (action === 'ping') {
      return json_({ ok: true, message: 'write-ready' });
    }
    if (action === 'updaterow') {
      return json_(updateRow_(body));
    }
    if (action === 'appendrow') {
      return json_(appendRow_(body));
    }
    return json_({ ok: false, error: 'Acción no soportada: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function verifyWriteToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('SHEETS_WRITE_TOKEN');
  if (!expected || !String(expected).trim()) {
    return true; // sin token configurado: permite escritura (solo equipo)
  }
  return String(token || '') === String(expected);
}

function updateRow_(body) {
  var sheetName = String(body.sheetName || '').trim();
  if (!sheetName) {
    return { ok: false, error: 'sheetName requerido' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { ok: false, error: 'Hoja no encontrada: ' + sheetName };
  }

  var values = sheet.getDataRange().getValues();
  if (!values.length) {
    return { ok: false, error: 'Hoja vacía' };
  }

  var headerInfo = findHeaderRow_(values);
  if (headerInfo.idx < 0) {
    return { ok: false, error: 'No se detectó fila de encabezados' };
  }

  var headers = headerInfo.headers;
  var match = body.match || {};
  var rowIndex = findMatchingRow_(values, headerInfo.idx, headers, match);
  if (rowIndex < 0) {
    return { ok: false, error: 'Fila no encontrada con los criterios de match', match: match };
  }

  var fields = body.fields || {};
  var updated = [];
  Object.keys(fields).forEach(function (key) {
    var col = findColumn_(headers, key);
    if (col >= 0) {
      sheet.getRange(rowIndex + 1, col + 1).setValue(fields[key]);
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

function appendRow_(body) {
  var sheetName = String(body.sheetName || '').trim();
  if (!sheetName) {
    return { ok: false, error: 'sheetName requerido' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { ok: false, error: 'Hoja no encontrada: ' + sheetName };
  }

  var values = sheet.getDataRange().getValues();
  var headerInfo = findHeaderRow_(values);
  if (headerInfo.idx < 0) {
    return { ok: false, error: 'No se detectó fila de encabezados' };
  }
  var headers = headerInfo.headers;
  var fields = body.fields || {};
  var row = headers.map(function (h) {
    var v = pickField_(fields, h);
    return v === undefined ? '' : v;
  });
  sheet.appendRow(row);
  return { ok: true, sheetName: sheetName, rowNumber: sheet.getLastRow(), appended: true };
}

function findHeaderRow_(values) {
  var bestIdx = -1;
  var bestHeaders = [];
  var bestScore = 0;
  for (var i = 0; i < Math.min(values.length, 40); i++) {
    var row = values[i];
    var headers = row.map(function (c) { return normalizeHeader_(c); });
    var score = 0;
    headers.forEach(function (h) {
      if (!h) return;
      if (h.indexOf('FECHA') >= 0 || h.indexOf('CELULAR') >= 0 || h.indexOf('CLIENTE') >= 0 ||
          h.indexOf('NOMBRE') >= 0 || h.indexOf('SEMAFORO') >= 0 || h.indexOf('CANAL') >= 0 ||
          h.indexOf('VENTA') >= 0 || h.indexOf('SERVICIO') >= 0) {
        score++;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      bestHeaders = headers;
    }
  }
  return { idx: bestScore >= 2 ? bestIdx : (values.length ? 0 : -1), headers: bestHeaders.length ? bestHeaders : (values[0] || []).map(normalizeHeader_) };
}

function findMatchingRow_(values, headerIdx, headers, match) {
  var colCel = findColumn_(headers, 'CELULAR') >= 0 ? findColumn_(headers, 'CELULAR')
    : (findColumn_(headers, 'TELEFONO') >= 0 ? findColumn_(headers, 'TELEFONO') : findColumn_(headers, 'WHATSAPP'));
  var colFecha = findColumn_(headers, 'FECHA');
  if (colFecha < 0) colFecha = findColumn_(headers, 'FECHA COT');
  var colCliente = findColumn_(headers, 'CLIENTE');
  if (colCliente < 0) colCliente = findColumn_(headers, 'NOMBRE');

  var wantCel = digits_(match.celular || match.phone || '');
  var wantFecha = normalizeDate_(match.fecha || match.date || '');
  var wantCliente = normalizeHeader_(match.cliente || match.nombre || '');

  for (var r = headerIdx + 1; r < values.length; r++) {
    var row = values[r];
    var cel = colCel >= 0 ? digits_(row[colCel]) : '';
    var fecha = colFecha >= 0 ? normalizeDate_(row[colFecha]) : '';
    var cliente = colCliente >= 0 ? normalizeHeader_(row[colCliente]) : '';

    var okCel = !wantCel || (cel && (cel === wantCel || cel.endsWith(wantCel) || wantCel.endsWith(cel)));
    var okFecha = !wantFecha || (fecha && (fecha === wantFecha || fecha.indexOf(wantFecha) === 0 || wantFecha.indexOf(fecha) === 0));
    var okCliente = !wantCliente || (cliente && cliente === wantCliente);

    // Prefer celular+fecha; if no fecha in match, celular alone (last match wins → scan reverse)
    if (okCel && okFecha && okCliente) {
      if (wantCel || wantFecha || wantCliente) {
        return r;
      }
    }
  }

  // Fallback: only celular (last occurrence)
  if (wantCel) {
    for (var r2 = values.length - 1; r2 > headerIdx; r2--) {
      var cel2 = colCel >= 0 ? digits_(values[r2][colCel]) : '';
      if (cel2 && (cel2 === wantCel || cel2.endsWith(wantCel) || wantCel.endsWith(cel2))) {
        return r2;
      }
    }
  }
  return -1;
}

function findColumn_(headers, key) {
  var target = normalizeHeader_(key);
  var i;
  for (i = 0; i < headers.length; i++) {
    if (headers[i] === target) return i;
  }
  for (i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h && h.indexOf(target) >= 0) return i;
  }
  var aliases = {
    'CELULAR': ['TELEFONO', 'WHATSAPP', 'PHONE'],
    'CLIENTE': ['NOMBRE', 'NAME'],
    'SEMAFORO': ['STATUS', 'ESTADO'],
    'NOTAS': ['NOTA', 'OBSERVACIONES', 'COMENTARIOS'],
    'PROXIMO SEGUIMIENTO': ['PROXIMO', 'PROX SEGUIMIENTO'],
    'FECHA SERVICIO': ['FECHASERVICIO'],
    'FECHA COTIZADO': ['FECHA COTIZACION', 'FECHA DE COTIZACION'],
    'OBJECION': ['OBJECCION'],
    'REGISTRADO': ['REGISTRADA'],
    'COTIZADO': ['COTIZACION']
  };
  var list = aliases[target] || [];
  for (var a = 0; a < list.length; a++) {
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] === list[a]) return j;
    }
    for (var k = 0; k < headers.length; k++) {
      if (headers[k] && headers[k].indexOf(list[a]) >= 0) return k;
    }
  }
  return -1;
}

function pickField_(fields, header) {
  if (!fields) return undefined;
  if (Object.prototype.hasOwnProperty.call(fields, header)) return fields[header];
  var keys = Object.keys(fields);
  for (var i = 0; i < keys.length; i++) {
    if (normalizeHeader_(keys[i]) === header) return fields[keys[i]];
  }
  return undefined;
}

function normalizeHeader_(v) {
  return String(v == null ? '' : v)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function digits_(v) {
  return String(v == null ? '' : v).replace(/\D+/g, '');
}

function normalizeDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'America/Bogota', 'yyyy-MM-dd');
  }
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  // Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    var n = Number(s);
    if (n > 20000 && n < 80000) {
      var epoch = new Date(Date.UTC(1899, 11, 30));
      var d = new Date(epoch.getTime() + n * 86400000);
      return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
    }
  }
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  var m2 = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m2) {
    var y = m2[3].length === 2 ? ('20' + m2[3]) : m2[3];
    return y + '-' + ('0' + m2[2]).slice(-2) + '-' + ('0' + m2[1]).slice(-2);
  }
  return s.substring(0, 10);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
