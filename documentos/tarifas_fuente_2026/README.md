# Fuentes de tarifas 2026

Maestros de venta del paquete **ACUERDOS_TARIFAS_PROVEEDORES_2026**, referenciados por `Tarifas_y_Proveedores_2026_SIG.docx`.

| Archivo | Uso en cotizador |
|---|---|
| `PORTAFOLIO DE COSTOS TOURS  PRIVADOS 2026.xlsx` | Precios de venta PRIVADO (`PRECIO DE VENTA CON IVA`) |
| `TARIFAS CIVITATIS 2026 - TOURS COMPARTIDOS 2026.xlsx` | Precios de venta COMPARTIDO (`Precio Sugerido de Venta`) |
| `TABLA DE CONTENIDO DE TARIFAS PROVEEDORES 2026.xlsx` | Índice de tarifarios / costos internos |
| `Check List Portafolio.xlsx` | Checklist operativo por experiencia |
| `PLANES TODO INCLUIDO 2026.xlsx` | Plantilla de planes (costos aún en 0 en varias filas) |
| `INFORMACIÓN DE TOURS PARA CHAT BOT.xlsx` | Textos descriptivos (no escalas de venta) |

Regenerar catálogo:

```bash
py -3 scripts/update_catalogo_from_tarifas_docx.py
py -3 scripts/rebuild_catalogo_from_tarifas_excel.py
```

Resultado: `backend/src/main/resources/ai/catalogo/` y `documentos/catalogo/` (versión `2026.3+`).
