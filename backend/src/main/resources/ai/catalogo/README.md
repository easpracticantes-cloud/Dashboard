# Catálogo comercial EAS (fuente de precios para la IA)

La IA (Ave / cotizador / Gemini) lee **solo estos archivos**. No depende de tablas PostgreSQL para tarifas.

## Archivos

| Archivo | Contenido |
|---------|-----------|
| `productos.json` | Tours + `priceScaleByPax` (1–6 personas) |
| `proveedores.json` | Proveedores asociados |
| `meta.json` | Reglas, paquetes, políticas, pendientes |
| `productos/*.json` | (Opcional) un tour extra por archivo |

## Cómo agregar o corregir un precio

1. Edita `productos.json` (o agrega un JSON en `productos/`).
2. Reinicia el backend.
3. Ave usará la nueva tarifa en la siguiente cotización.

Copia espejo en documentación: `documentos/catalogo/`.
