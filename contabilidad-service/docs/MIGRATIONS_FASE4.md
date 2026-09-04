# Migraciones — Fase 4 (Cuentas por Pagar)

Todas las migraciones de esta fase son **aditivas**: no se borra ni se recrea
ninguna tabla existente y no hace falta reiniciar `data/contable.db`.

Se aplican solas al arrancar el servicio, desde `init_db()`:

```
Base.metadata.create_all(engine)   # crea las tablas nuevas si faltan
_apply_sqlite_migrations()         # migraciones previas (fases 1–3)
_apply_fase4_migrations()          # esta fase
```

`_apply_fase4_migrations()` (en `src/infrastructure/persistence/database.py`)
usa `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` sobre columnas
ausentes según `PRAGMA table_info`, y `CREATE INDEX IF NOT EXISTS`. Es
idempotente: ejecutarla varias veces no cambia nada.

## Tablas nuevas

### `accounting_adjustments` — anulaciones y ajustes (4.2)

Nada se borra: toda corrección deja rastro del valor anterior, el motivo y el
usuario responsable.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | INTEGER PK | |
| `entity_type` | VARCHAR(64) | `Payment`, `AccountCrossing`, … |
| `entity_id` | VARCHAR(64) | Id de la entidad corregida |
| `action` | VARCHAR(32) | `ANULACION` \| `AJUSTE` |
| `motivo` | TEXT NOT NULL | Obligatorio |
| `valor_anterior` | TEXT | JSON o importe previo |
| `valor_nuevo` | TEXT | JSON o importe nuevo |
| `related_entity_id` | VARCHAR(64) | Cruce asociado, por ejemplo |
| `usuario` | VARCHAR(128) | Resuelto desde `X-SIG-Username` |
| `created_at` | DATETIME | |

Índice: `ix_adjustments_entity (entity_type, entity_id)`.

### `period_closures` — cierre operativo semanal (4.6)

Semana contable sábado–viernes, en fechas ISO (`YYYY-MM-DD`), comparables
lexicográficamente.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | INTEGER PK | |
| `period_start` / `period_end` | VARCHAR(32) | Sábado y viernes |
| `status` | VARCHAR(16) | `OPEN` \| `CLOSED` |
| `summary_json` | TEXT | KPIs y pendientes al momento del cierre |
| `observaciones` | TEXT | Nota del cierre |
| `closed_by` / `closed_at` | VARCHAR(128) / DATETIME | |
| `reopened_by` / `reopened_at` / `motivo_reapertura` | | Reapertura auditada |
| `created_at` / `updated_at` | DATETIME | |

Índice: `ix_period_closures_rango (period_start, period_end)`.

## Enums ampliados (columnas `String`, sin cambio de esquema)

Los estados viven en columnas `VARCHAR`, así que agregar valores no altera la
tabla ni afecta filas existentes:

- `PaymentStatus.ANULADO`
- `DocumentStatus.ANULADO`
- Nuevos enums `AdjustmentAction` y `PeriodClosureStatus`

## Cambios de comportamiento sobre datos existentes

Ninguno se aplica retroactivamente: no hay backfill ni `UPDATE` masivo.

1. **Crear un pago ya no marca el cruce como `PAGADO`.** El cruce queda en
   `APROBADO` y solo `mark_paid` (confirmación bancaria) lo pasa a `PAGADO`,
   fijando además `fecha_pago` si venía vacía. Las filas históricas que
   quedaron en `PAGADO` con el comportamiento anterior no se tocan.
1b. **`fecha_pago` / observaciones Autobits / Excel ya no producen `PAGADO`.**
   Son metadatos o señales operativas (como máximo `APROBADO`). Un cruce
   ya `PAGADO` por `mark_paid` no se degrada en sync/`complete`/Excel.
2. **Subir un comprobante ya no adelanta el estado de un pago sin confirmar.**
   Desde `PENDIENTE_PAGO` el comprobante se adjunta y el pago espera
   `mark_paid`; desde `PAGADO` o `COMPROBANTE_PENDIENTE` pasa a `COMPLETADO`
   como antes.
3. **Un pago `ANULADO` deja libre el cruce**, de modo que se puede generar un
   pago nuevo (`PaymentRepository.get_active_by_crossing` ignora anulados).
4. **KPIs del dashboard**: si el filtro no deja documentos, las entidades
   relacionadas devuelven listas vacías en vez de todo el período.

## Verificación sobre una base real

```powershell
Copy-Item data\contable.db $env:TEMP\contable_check.db
$env:DATABASE_URL = "sqlite:///$($env:TEMP -replace '\\','/')/contable_check.db"
python -c "import sys; sys.path.insert(0,'src'); from infrastructure.persistence.database import init_db; init_db(); init_db()"
```

Resultado esperado: dos tablas nuevas, cero filas perdidas y ninguna tabla
recreada, aun ejecutando la migración dos veces.

## Reversión

No se requiere. Si hiciera falta volver atrás:

```sql
DROP TABLE IF EXISTS accounting_adjustments;
DROP TABLE IF EXISTS period_closures;
```

Ninguna tabla previa depende de ellas por clave foránea.
