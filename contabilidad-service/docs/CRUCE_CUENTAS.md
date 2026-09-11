# Cruce de Cuentas

## Antes

El flujo de producto pedía **dos Excels**:

1. Autobits (reporte semanal) → `autobits_records` + `account_crossings`.
2. Libro manual **CRUCE DE CUENTAS** (bloques por proveedor) → `cruce_records`.

El sistema comparaba ambos, copiaba FACTURA/CDC y FECHA DE PAGO del libro
manual a las filas del cruce, y listaba pendientes
(`SIN_FACTURA`, `SIN_FECHA_PAGO`, `FALTA_EN_CRUCE`, `SOBRA_EN_CRUCE`, …).

Las facturas del paso 3 no se podían subir hasta que existiera ese segundo Excel.

Autobits **no se elimina**. Sigue siendo la carga operativa semanal.

## Después

Cruce de Cuentas **no pide un Excel de entrada**.

```
Autobits (ya importado)
Facturas / documentos
Proveedores (NIT/nombre)  -->  analizar_desde_sistema  -->  Excel estándar de salida
Pagos / fecha_pago
```

- `POST /api/cruce-excel/analizar` — consolida SIG y reporta pendientes.
- `GET /api/cruce-excel/export.xlsx` — clona la plantilla maestra
  `src/infrastructure/cruce/templates/CRUCE_DE_CUENTAS_MAESTRO.xlsx`
  (copia intacta de «CRUCE DE CUENTAS 2026.xlsx»), limpia datos históricos
  y escribe las filas del lote/`document_ids` actuales. El archivo original
  del usuario no se modifica. Nombre de salida: `Cruce_Cuentas_YYYY-MM-DD.xlsx`.
- `GET /api/cruce-excel/pendientes` — bandeja SIG; no relee un Excel de cruce
  histórico aunque exista un snapshot de upload.
- `POST /api/cruce-excel/upload` **se conserva** por compatibilidad; la UI de
  Contabilidad ya no lo usa.

## Fuentes SIG (solo lo que el modelo respalda)

| Campo Excel | Fuente | Nota |
|---|---|---|
| Nombre del bloque (proveedor) | `account_crossings.proveedor_nombre` / Autobits / `providers.nombre` | |
| NIT/CC | Autobits `nit` / `providers.nit` | No se asume igual al NIT de la factura sin matching |
| FECHA DE EJECUCIÓN | Autobits `fecha` / crossing `fecha_ejecucion` | |
| ORDEN DE COMPRA | `numero_compra` | Clave fuerte de matching |
| REF. | `numero_reserva` | |
| VALOR / PRECIO EAS | Autobits `valor` / `valor_autobits` | `Decimal`; celda vacía si no hay valor (nunca 0 inventado) |
| FACTURA/CDC | `factura_cdc` o `documents.numero_documento` | Vacío si falta |
| FECHA DE PAGO | `account_crossings.fecha_pago` | No se usa `payments.paid_at` (es confirmación bancaria) |
| Concepto / Description | Autobits / documento `concepto` | |
| estado de la compra | Autobits `estado_compra` | |
| MES (DUSTER) | Derivado de la fecha | |

### Sin fuente en SIG (no se inventa)

PRECIO TERCEROS, Referencia OC, Comprador, Vendedor, Cantidad, INGRESO,
SALDO ANTERIOR, PRE COMPRA ENTRADAS, ENTRADAS A FAVOR, dinero entregado al
guía, bitácora, recibos, fotografías, tiempo de demora.

Clientes de SIG (`sig.clients`) **no aparecen** en el Excel estándar: el libro
es de proveedores/compras, no de clientes CRM.

## Matching (reglas ya existentes, no inventadas)

Prioridad del motor (`MatchingEngine` + `crossing_match_keys`):

1. ID de factura/CDC = `factura_cdc` / `numero_documento`
2. Orden de compra exacta (`normalize_id`)
3. NIT normalizado
4. Nombre de proveedor similar
5. Reserva
6. Valor (tolerancia contable existente) y fecha

Si dos candidatos superan el umbral probable y quedan a menos de 8 puntos, se
marca **ambiguo** (`MATCH_PROBABLE` + reason `ambiguo`). No se confirma en silencio.

Duplicados: misma clave de negocio Autobits `NIT + compra + reserva`. Se
identifican; no se borran.

## Pestañas del Excel de salida (orden del estándar)

1. `AÑO  {yyyy} ENERO - ABRIL` — bloques laterales por proveedor
2. `MAYO - JULIO`
3. `AGOSTO` — el estándar no tiene hoja Sep–Dic; esos meses caen aquí
4. `VENTAS_DUSTER` — filas cuyo proveedor contiene «duster»
5. `CDC BOSQUE DE PALMAS` — proveedor «bosque»
6. `PRECOMPRA LUGER {yyyy}` — proveedor «luger»

### Fórmulas que se conservan (sistemáticas)

- `TOTAL PAGADOS` = `SUMIF` de VALOR solo si hay FECHA DE PAGO (no suma lo impago)
- `TOTAL` de PRECIO EAS / Total en DUSTER y BOSQUE = `SUM`
- Referencia OC, PRECIO TERCEROS, Comprador, Vendedor, Cantidad: solo si vienen en `raw_json` de Autobits de la columna
- `VALOR A PAGAR` del bloque guía del estándar (= VALOR GUIANZA) **no se emite**
  porque las columnas extra de guía no tienen fuente; el bloque canónico es de 6 columnas

No se reproducen fórmulas ad-hoc del archivo de trabajo (restas con literales,
`#REF!`, notas de Word Office).

## UI

Contabilidad → Cruce / Pendientes / Wizard paso 2:

- **Procesar** — analiza SIG
- **Generar Excel** — descarga el estándar

Se mantiene el upload de Autobits, facturas, documentos y OCR.
