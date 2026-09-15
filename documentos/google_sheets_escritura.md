# Escritura SIG → Google Sheets

El dashboard ahora puede **editar seguimientos y ventas** y guardar esos cambios en el workbook de Google Sheets.

## Activación (obligatorio)

1. Abre el spreadsheet → **Extensiones → Apps Script**.
2. Pega **`documentos/google_sheets_webapp_completo.gs`** (lectura `doGet` + escritura `doPost`).  
   Si solo pegas `google_sheets_webapp_write.gs`, el SIG **deja de leer** las hojas.
3. Opcional: en **Propiedades del proyecto** crea `SHEETS_WRITE_TOKEN` y el mismo valor en el servidor como `GOOGLE_SHEETS_WRITE_TOKEN`.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copia la URL `/exec` a `GOOGLE_SHEETS_WEBAPP_URL` y recrea el backend.

Sin el `doPost` desplegado, el botón “Guardar en Google Sheets” fallará. Sin el `doGet` con `fullData`, el dashboard/registro quedará vacío.

## Error HTTP 405 / HTML tras guardar

Eso pasa si la URL `/exec` es de una implementación **anterior** (solo `doGet`) o no se creó **nueva implementación** después de pegar `doPost`.

1. En Apps Script: **Implementar → Nueva implementación** (no solo “Administrar”).
2. Tipo Aplicación web → Ejecutar como **Yo** → Acceso **Cualquiera**.
3. Copia la **nueva** URL `/exec` a `GOOGLE_SHEETS_WEBAPP_URL` en el servidor.
4. `docker compose up -d --force-recreate backend`.

## Dashboard vacío tras cambiar URL

La misma URL sirve para **GET (leer)** y **POST (escribir)**. Si la implementación nueva no tiene `doGet` con `data[hoja].fullData`, el sync no carga hojas. Usa `google_sheets_webapp_completo.gs`.

## Uso en la app

1. Entra a **Dashboard** → pestaña **Seguimientos** o **Ventas**.
2. Pulsa el icono de editar en la fila.
3. Cambia los campos y **Guardar en Google Sheets**.
4. El cambio se escribe en la hoja y se refleja en la tabla del SIG.

## API

- `PUT /api/v1/integrations/sheets/seguimiento`
- `PUT /api/v1/integrations/sheets/venta`
- `POST /api/v1/integrations/sheets/rows` (genérico: `updateRow` / `appendRow`)
