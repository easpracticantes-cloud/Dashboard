# Escritura SIG → Google Sheets

El dashboard ahora puede **editar seguimientos y ventas** y guardar esos cambios en el workbook de Google Sheets.

## Activación (obligatorio)

1. Abre el spreadsheet → **Extensiones → Apps Script**.
2. Agrega el contenido de `documentos/google_sheets_webapp_write.gs` (mantén tu `doGet` actual si ya existe).
3. Opcional: en **Propiedades del proyecto** crea `SHEETS_WRITE_TOKEN` y pon el mismo valor en Render como `GOOGLE_SHEETS_WRITE_TOKEN`.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copia la URL `/exec` a `GOOGLE_SHEETS_WEBAPP_URL` / setting `integrations.googleSheets.webAppUrl`.

Sin el `doPost` desplegado, el botón “Guardar en Google Sheets” fallará con un mensaje indicando que falta el script.

## Uso en la app

1. Entra a **Dashboard** → pestaña **Seguimientos** o **Ventas**.
2. Pulsa el icono de editar en la fila.
3. Cambia los campos y **Guardar en Google Sheets**.
4. El cambio se escribe en la hoja y se refleja en la tabla del SIG.

## API

- `PUT /api/v1/integrations/sheets/seguimiento`
- `PUT /api/v1/integrations/sheets/venta`
- `POST /api/v1/integrations/sheets/rows` (genérico: `updateRow` / `appendRow`)
