# Requisitos funcionales — Sistema Contable IA

> Derivados del proceso contable de Andrea Casas y del prompt maestro de evolución.  
> **Versión:** 1.0 (diagnóstico)  
> **Alcance:** primera versión funcional local con human-in-the-loop

---

## 1. Propósito del sistema

Evolucionar la POC **Facturas IA** hacia un **Sistema Contable Asistido por IA** que permita:

> Recibir documentos → entenderlos → cruzarlos con Autobits → validarlos → detectar errores → preparar pagos → registrar comprobantes → organizar soportes → controlar subsanaciones → mantener trazabilidad.

La IA es **un componente**, no la autoridad contable.

---

## 2. Actores

| Actor | Rol |
|-------|-----|
| **Andrea** | Contabilidad: importa Autobits, revisa cruces, aprueba pagos, ejecuta pago manual en Bancolombia, sube comprobantes, gestiona subsanaciones |
| **Katherine** | Recibe paquetes digitales para digitalización en Word Office |
| **Sistema** | OCR, extracción IA, reglas, matching, estados, reportes, exportaciones |
| **Proveedores** | Origen de facturas/cuentas de cobro (WhatsApp, email, DIAN) — **sin automatización de acceso en v1** |

---

## 3. Proceso de negocio (fuente principal)

```text
PASO 1  Autobits — reporte semanal (SÁBADO → VIERNES)
PASO 2  Documentos proveedores (WhatsApp / Email / DIAN → Drive)
PASO 3  Cruce de cuentas (documento ↔ Autobits)
PASO 4  Reporte de pagos
PASO 5  Pago manual Bancolombia (HUMANO — no automatizar)
PASO 6  Comprobante → contramarcar → Drive → WhatsApp
PASO 7  Actualizar Autobits (exportar / marcar listo — sin API fake)
PASO 8  Paquete digital → Katherine
PASO 9  Subsanaciones cuando hay errores
```

---

## 4. Requisitos por módulo

### 4.1 Dashboard

**RF-DASH-01** El sistema debe mostrar KPIs del período:
- Documentos recibidos / procesados
- Pendientes de revisión
- Aprobados
- Subsanaciones pendientes
- Pagos pendientes / realizados
- Paquetes digitales pendientes

**RF-DASH-02** Debe mostrar totales monetarios:
- Total documentos del período
- Total valor documentos
- Total aprobado / pendiente / pagado / por subsanar

**RF-DASH-03** Filtros obligatorios:
- Semana (sábado–viernes)
- Mes, año
- Proveedor, estado, tipo de documento

---

### 4.2 Documentos

**RF-DOC-01** Cada documento debe almacenar:

| Campo | Descripción |
|-------|-------------|
| ID | Identificador único |
| Nombre archivo | Original sanitizado |
| Tipo | FACTURA, CUENTA_DE_COBRO, COMPROBANTE_PAGO, INGRESO, OTRO |
| Proveedor | Nombre |
| NIT | Identificación tributaria |
| Número documento | Número de factura/cuenta |
| Fecha | Emisión |
| Subtotal, IVA, Total | Valores numéricos |
| Origen | WHATSAPP, EMAIL, DIAN, AUTOBITS, CARGA_MANUAL |
| Estado | Ver máquina de estados §6 |
| Fecha recepción | Timestamp |

**RF-DOC-02** Upload manual de imágenes/PDF con:
- Límite de tamaño configurable
- Extensiones permitidas: jpg, jpeg, png, pdf
- Sanitización de nombres
- Prevención path traversal

**RF-DOC-03** Vista detalle con:
- Imagen/PDF
- Datos extraídos + confidence
- Resultado cruce Autobits
- Subsanaciones relacionadas
- Pagos relacionados

**RF-DOC-04** Detección de duplicados por:
- Hash archivo
- NIT + número documento + proveedor + total + fecha
- Estado `POSIBLE_DUPLICADO` — **no eliminar automáticamente**

---

### 4.3 Procesamiento IA (Document AI)

**RF-PROC-01** Pipeline obligatorio:

```text
Archivo → Detección tipo → Preprocesamiento → OCR → Texto
  → Extracción IA → JSON → Confidence → Validación reglas → Persistencia
```

**RF-PROC-02** Mantener tecnologías actuales: Tesseract, OpenCV, Ollama.

**RF-PROC-03** Esquema de extracción mínimo:

```json
{
  "tipo_documento": "FACTURA",
  "proveedor": { "nombre": null, "nit": null },
  "documento": { "numero": null, "fecha_emision": null, "fecha_vencimiento": null },
  "valores": { "subtotal": null, "iva": null, "total": null },
  "concepto": null,
  "reserva": null,
  "compra": null,
  "observaciones": [],
  "confidence": { "global": 0, "campos": {} },
  "requiere_revision": false
}
```

**RF-PROC-04** No inventar datos: campos ausentes = `null`.

**RF-PROC-05** Confidence score por campo y global.  
Si confianza baja → `REQUIERE_REVISION` — no aprobar automáticamente.

**RF-PROC-06** Procesamiento **asíncrono** con `ProcessingJob`:
- Estados: PENDING, PROCESSING, COMPLETED, FAILED, REQUIRES_REVIEW
- UI con progreso

**RF-PROC-07** Compatibilidad legacy:
- `POST /api/procesar` sigue funcionando
- `python src/main.py` sigue funcionando

---

### 4.4 Rule Engine (reglas determinísticas)

**RF-RULE-01** La IA no decide estados contables finales; el Rule Engine sí propone estados basados en reglas.

**RF-RULE-02** Reglas iniciales (extensibles):

| ID | Condición | Resultado |
|----|-----------|-----------|
| R1 | NIT documento ≠ NIT proveedor esperado | SUBSANACIÓN |
| R2 | Total documento ≠ valor Autobits | REVISIÓN |
| R3 | Sin número de documento | SUBSANACIÓN |
| R4 | Sin proveedor | SUBSANACIÓN |
| R5 | Compra sin reserva relacionada | SUBSANACIÓN |
| R6 | Falta soporte obligatorio | SUBSANACIÓN |
| R7 | Todos los datos requeridos coinciden | APROBADO |

**RF-RULE-03** Arquitectura extensible para agregar reglas sin modificar código core.

**RF-RULE-04** No implementar reglas contables no confirmadas por Andrea.

---

### 4.5 Autobits

**RF-AUTO-01** Importar reporte Excel semanal (sábado–viernes).

**RF-AUTO-02** Importador robusto:
- Detectar columnas
- Preview antes de confirmar
- Mapeo configurable: Columna Excel → Campo interno
- Validar datos, reportar errores
- Evitar duplicados por período
- Guardar fecha de importación

**RF-AUTO-03** Mostrar registros: proveedores, compras, reservas, valores, fechas, relaciones.

**RF-AUTO-04** `AutobitsAdapter` desacoplado:
- v1: `ExcelAutobitsAdapter`
- Futuro: `ApiAutobitsAdapter` — **solo si existe API real**

**RF-AUTO-05** Exportar datos para actualización manual en Autobits → estado `LISTO_PARA_ACTUALIZAR_AUTOBITS`.

---

### 4.6 Cruce de cuentas

**RF-CRUCE-01** Vista tabla:

| Documento | Proveedor | Compra | Reserva | Valor Doc | Valor Autobits | Diferencia | Estado |

**RF-CRUCE-02** Estados: PENDIENTE, EN_REVISION, APROBADO, SUBSANACION, PAGADO.

**RF-CRUCE-03** Matching automático con clasificación:
- MATCH_EXACTO
- MATCH_PROBABLE (requiere aprobación humana)
- SIN_MATCH

**RF-CRUCE-04** Criterios de matching (orden de prioridad):
1. Número exacto compra/documento
2. NIT
3. Proveedor
4. Reserva
5. Valor
6. Fecha
7. Coincidencias parciales

**RF-CRUCE-05** Crear subsanación automática cuando hay diferencia o falta de relación.

---

### 4.7 Subsanaciones

**RF-SUB-01** Campos:

| Campo | Tipo |
|-------|------|
| ID | Auto |
| Documento | FK |
| Proveedor | Texto |
| Tipo de problema | Enum |
| Descripción | Texto |
| Valor involucrado | Numérico |
| Responsable | Texto |
| Fecha creación | DateTime |
| Fecha límite | Date |
| Estado | Enum |
| Observaciones | Texto |

**RF-SUB-02** Estados: PENDIENTE, EN_PROCESO, CORREGIDO, CERRADO.

**RF-SUB-03** Creación automática desde Rule Engine y Matching.

**RF-SUB-04** CRUD manual por Andrea.

---

### 4.8 Pagos

**RF-PAG-01** Mostrar: proveedor, documento, reserva, compra, valor, estado, fechas, comprobante.

**RF-PAG-02** Estados:
- PENDIENTE_APROBACION
- APROBADO
- PENDIENTE_PAGO
- PAGADO
- COMPROBANTE_PENDIENTE
- COMPLETADO

**RF-PAG-03** **NO** automatizar Bancolombia.  
El sistema llega hasta `PENDIENTE_PAGO` / `APROBADO`; Andrea ejecuta el pago manualmente.

**RF-PAG-04** Reporte de pagos listos para ejecutar (exportable).

**RF-PAG-05** No almacenar credenciales bancarias.

---

### 4.9 Comprobantes

**RF-COMP-01** Subir PDF o imagen de comprobante.

**RF-COMP-02** Asociar a: pago, factura, proveedor, compra, reserva.

**RF-COMP-03** Validar que pago tenga comprobante antes de `COMPLETADO`.

**RF-COMP-04** Registrar contramarcación (metadato/flag manual).

---

### 4.10 Almacenamiento (Storage)

**RF-STOR-01** `StorageProvider` abstracto.

**RF-STOR-02** v1: `LocalStorageProvider` con estructura:

```text
/YYYY/MM/FACTURA/
/YYYY/MM/PAGOS/
/YYYY/MM/INGRESOS/
/YYYY/MM/SUBSANACIONES/
/YYYY/MM/PAQUETES_DIGITALES/
```

**RF-STOR-03** `GoogleDriveStorageProvider`: adapter preparado, deshabilitado por defecto.  
Mensaje UI: **"Integración no configurada"** si no hay credenciales.

**RF-STOR-04** Variables de entorno para configuración — sin secretos en código.

---

### 4.11 Paquetes digitales

**RF-PAQ-01** Agrupar: documento + cruce + validación + comprobante + observaciones.

**RF-PAQ-02** Estados: PENDIENTE, GENERADO, ENTREGADO, DIGITALIZADO, CERRADO.

**RF-PAQ-03** Responsable por defecto: Katherine.

**RF-PAQ-04** Exportar/preparar paquete para entrega.

---

### 4.12 Reportes

**RF-REP-01** Reportes requeridos:
- Documentos
- Cruces
- Subsanaciones
- Pagos
- Documentos pendientes
- **Reporte semanal (sábado–viernes)**

**RF-REP-02** Exportación CSV/Excel/HTML según reporte.

**RF-REP-03** CSV de resultados POC pasa a ser formato de **exportación**, no BD principal.

---

### 4.13 Auditoría

**RF-AUD-01** Registrar cambios importantes:

| Campo | Ejemplo |
|-------|---------|
| Usuario | ANDREA |
| Fecha | 25/08/2026 16:30 |
| Acción | CAMBIO_ESTADO |
| Entidad | Payment |
| ID | 123 |
| Valor anterior | PENDIENTE_PAGO |
| Valor nuevo | PAGADO |

**RF-AUD-02** Aplicable a: documentos, cruces, pagos, subsanaciones, paquetes.

---

### 4.14 Seguridad

**RF-SEC-01** No guardar credenciales bancarias, API keys en código.

**RF-SEC-02** Validar archivos subidos (tipo, tamaño, nombre).

**RF-SEC-03** No ejecutar archivos subidos.

**RF-SEC-04** No confiar ciegamente en OCR ni IA.

**RF-SEC-05** Errores técnicos en log; mensajes amigables en UI.

---

### 4.15 Logging

**RF-LOG-01** Categorías: UPLOAD, OCR, IA, VALIDATION, MATCHING, PAYMENT, STORAGE, ERROR.

**RF-LOG-02** No registrar información sensible innecesaria.

---

## 5. Requisitos no funcionales

| ID | Requisito |
|----|-----------|
| RNF-01 | Ejecución local (Windows) sin nube obligatoria |
| RNF-02 | SQLite en desarrollo; diseño migrable a PostgreSQL |
| RNF-03 | Clean Code, SOLID, separación de capas |
| RNF-04 | Testabilidad — pytest backend, tests frontend |
| RNF-05 | OpenAPI automática en FastAPI |
| RNF-06 | UI empresarial moderna — no sobrecargada |
| RNF-07 | Compatibilidad con POC existente durante transición |
| RNF-08 | Human-in-the-loop en decisiones críticas |

---

## 6. Máquina de estados — Documento

```text
RECIBIDO
  ↓
PROCESANDO
  ↓
EXTRAIDO
  ↓
VALIDANDO
  ↓
CRUZANDO
  ↓
APROBADO
  ↓
PENDIENTE_PAGO
  ↓
PAGADO
  ↓
COMPROBANTE_RECIBIDO
  ↓
AUTOBITS_PENDIENTE
  ↓
AUTOBITS_ACTUALIZADO
  ↓
PAQUETE_DIGITAL
  ↓
ENTREGADO
  ↓
FINALIZADO

Estados alternativos:
  ERROR | REQUIERE_REVISION | SUBSANACION | DUPLICADO
```

---

## 7. Casos de prueba demo (dataset artificial)

| Caso | Entrada | Resultado esperado |
|------|---------|-------------------|
| Correcto | Factura = Autobits | APROBADO |
| Diferencia valor | Doc $850.000 vs Autobits $900.000 | SUBSANACION |
| Sin proveedor | Extracción incompleta | SUBSANACION |
| Compra sin reserva | Match parcial | SUBSANACION |
| Duplicado | Mismo NIT+número+total | POSIBLE_DUPLICADO |
| OCR débil | Pocos caracteres | REQUIERE_REVISION |
| Match probable | 94% coincidencia | EN_REVISION → aprobación humana |

---

## 8. Criterio de éxito — flujo completo v1

Debe ser posible ejecutar:

```text
1.  Subir factura
2.  OCR automático
3.  IA extrae datos + confidence
4.  Sistema guarda documento en BD
5.  Importar Excel Autobits
6.  Sistema intenta match compra/reserva
7.  Rule Engine → APROBADO o SUBSANACIÓN
8.  Si aprobado → PENDIENTE_PAGO
9.  Andrea paga manualmente en Bancolombia
10. Sube comprobante
11. Sistema relaciona comprobante
12. Estado → LISTO_PARA_ACTUALIZAR_AUTOBITS
13. Genera/prepara paquete digital
14. Marca entregado a Katherine
```

---

## 9. Exclusiones explícitas (v1)

- Automatización login/pagos Bancolombia
- API Autobits simulada
- Scraping DIAN / WhatsApp Web
- Google Drive sin credenciales reales
- Aprobación automática sin revisión humana en matches probables
- Multi-usuario / roles (futuro)

---

## 10. Trazabilidad requisitos → fases

| Fase | Requisitos principales |
|------|------------------------|
| 1 | RNF-01–08, RF-PROC-07, RF-SEC, RF-LOG |
| 2 | RF-DOC, RF-PROC-01–06 |
| 3 | RF-AUTO |
| 4 | RF-CRUCE, RF-RULE |
| 5 | RF-SUB |
| 6 | RF-PAG, RF-COMP |
| 7 | RF-STOR, RF-PAQ |
| 8 | RF-DASH, RF-REP |
| 9 | §7 casos demo, tests |

---

## 11. Referencias

- Arquitectura: [`ARQUITECTURA_CONTABLE_IA.md`](./ARQUITECTURA_CONTABLE_IA.md)
- Código actual: `src/`, `frontend/`
- Proceso Andrea: prompt maestro §3 y §55
