# Arquitectura propuesta — Sistema Contable IA

> Documento de diseño para la evolución de **Facturas IA** (POC) hacia **Sistema Contable Asistido por IA**.  
> Fecha de referencia: agosto 2026.  
> **Estado:** diagnóstico y diseño — sin implementación de lógica principal aún.

---

## 1. Resumen ejecutivo

El proyecto actual demuestra con éxito el pipeline **OCR → IA local → datos estructurados → exportación**.  
La evolución objetivo es convertirlo en un sistema que soporte el **proceso contable real de Andrea** (Autobits → documentos → cruce → pagos → comprobantes → paquete digital → subsanaciones), manteniendo **human-in-the-loop** y **sin automatizar pagos bancarios ni integraciones no documentadas**.

Principio rector:

```text
POC ACTUAL  →  Refactor incremental  →  Nuevos módulos  →  Sistema Contable IA
```

---

## 2. Diagnóstico del estado actual

### 2.1 Arquitectura actual

```text
┌─────────────────────────────────────────────────────────────────┐
│                        CAPA DE ENTRADA                          │
├─────────────────┬───────────────────────┬───────────────────────┤
│  main.py        │  api_server.py        │  app_desktop.py       │
│  (batch CLI)    │  (FastAPI + static)   │  (Tkinter legacy)     │
└────────┬────────┴───────────┬───────────┴───────────┬───────────┘
         │                    │                       │
         │         procesador_interactivo.py          │
         │                    │                       │
         └────────────────────┼───────────────────────┘
                              │
         ┌────────────────────┼───────────────────────┐
         ▼                    ▼                       ▼
   preprocesamiento.py    ocr.py              ia_ollama.py
   (OpenCV)              (Tesseract)         ia_ollama_custom.py
                              │                       │
                              └───────────┬───────────┘
                                          ▼
                                   validador.py
                                          │
                                          ▼
                              exportador.py / reporte.py
                                          │
                                          ▼
                         salidas/ (CSV, JSON, TXT, HTML)
                         salidas/app/ (interactivo)

┌─────────────────────────────────────────────────────────────────┐
│  frontend/ (Angular 19, standalone, 1 componente)              │
│  run_desktop.py → pywebview + servidor local :8787              │
└─────────────────────────────────────────────────────────────────┘
```

**Características:**

| Aspecto | Estado actual |
|---------|---------------|
| Persistencia | Archivos (CSV, JSON, TXT) — no hay BD |
| API | FastAPI mínima (`/api/health`, `/api/procesar`, `/api/preview`) |
| Frontend | Angular monolítico (`AppComponent` único) |
| OCR | Tesseract + fallback original/preprocesada — **funcional** |
| IA | Ollama `llama3.2` — prompt fijo + prompt custom |
| Validación | Campos mínimos en `validador.py` — no rule engine |
| Tests | **No existen** |
| Configuración | Constantes hardcodeadas + env `TESSERACT_CMD` |
| Async | Procesamiento **síncrono** (bloquea request/UI) |
| Auditoría | **No existe** |
| Integraciones | **Ninguna** (Autobits, Drive, Banco, DIAN, WhatsApp) |

### 2.2 Flujos existentes (que deben conservarse)

#### Flujo batch (`python src/main.py`)

```text
dataset/imagenes/*.jpg
  → preprocesamiento (OpenCV)
  → OCR con fallback
  → Ollama (JSON factura fijo)
  → validador.py
  → salidas/resultados.csv, errores.csv, json/, reporte.html
```

#### Flujo interactivo (`/api/procesar` + Angular)

```text
Upload multipart
  → salidas/app/uploads/
  → procesador_interactivo.py
  → OCR + ia_ollama_custom (prompt usuario)
  → salidas/app/respuestas/*.txt + *.json
```

#### Flujo desktop (`run_desktop.py`)

```text
pywebview → http://127.0.0.1:8787 → Angular build + API
```

### 2.3 Código reutilizable (extraer, no reescribir)

| Módulo | Reutilización propuesta |
|--------|-------------------------|
| `preprocesamiento.py` | → `TesseractOCRProvider` (capa infra) |
| `ocr.py` | → `OCRProvider` interface + implementación Tesseract |
| `ia_ollama.py` | → `OllamaAIProvider.extract_invoice()` |
| `ia_ollama_custom.py` | → `OllamaAIProvider.extract_custom()` |
| `validador.py` | → Semilla del **Rule Engine** (reglas determinísticas) |
| `exportador.py` | → Capa de **exportación** (CSV/JSON), no persistencia principal |
| `reporte.py` | → Generador de reportes HTML/PDF futuro |
| `procesador_interactivo.py` | → Base de `DocumentProcessingService` |
| `api_server.py` | → Router raíz FastAPI; mantener endpoints legacy |
| `frontend/` | → Shell UI; añadir routing y módulos por dominio |

### 2.4 Deuda técnica identificada

1. **Duplicación de orquestación** entre `main.py` y `procesador_interactivo.py`.
2. **Dos rutas de salida** (`salidas/` vs `salidas/app/`) sin modelo unificado.
3. **Dos UIs** (`app_desktop.py` Tkinter + Angular) — consolidar en Angular + pywebview.
4. **Sin capas**: lógica de negocio mezclada con I/O y prompts.
5. **Configuración dispersa**: timeouts, modelos, rutas en cada archivo.
6. **Sin tipado estructurado** en API (no Pydantic en endpoints actuales).
7. **Procesamiento bloqueante** — OCR + Ollama en el hilo HTTP.
8. **Sin tests** — alto riesgo al refactorizar.
9. **Sin detección de duplicados**, confidence score ni matching.
10. **CSV como almacén** — inadecuado para flujo contable con estados y relaciones.

### 2.5 Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Romper flujo batch al refactorizar | Alto | Mantener `main.py` funcional; wrappers sobre servicios nuevos |
| Ollama timeout / JSON inválido | Medio | Jobs async + reintentos + estado REQUIRES_REVIEW |
| Extracción IA incorrecta aprobada | **Crítico** | Rule Engine + confidence + human-in-the-loop |
| Excel Autobits con columnas variables | Alto | Importador con mapeo configurable |
| Scope demasiado grande | Alto | Implementación por fases con criterios de salida |
| Integraciones inventadas | **Crítico** | Adapters + mensaje "Integración no configurada" |

---

## 3. Arquitectura objetivo

### 3.1 Vista por capas (Clean Architecture)

```text
┌──────────────────────────────────────────────────────────────────┐
│ PRESENTACIÓN                                                     │
│  Angular: Dashboard, Documentos, Autobits, Cruce, Pagos, ...     │
│  FastAPI routers: /api/documents, /api/crossings, ...            │
│  Legacy: /api/health, /api/procesar (transición)                 │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│ APLICACIÓN (Services / Use Cases)                                  │
│  DocumentProcessingService, CrossingService, PaymentService,       │
│  RemediationService, PackageService, ReportService, JobService     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│ DOMINIO                                                            │
│  Entidades, estados, RuleEngine, MatchingEngine, ConfidenceScorer  │
│  Eventos de auditoría, transiciones de estado                     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│ INFRAESTRUCTURA (Adapters)                                         │
│  TesseractOCRProvider    OllamaAIProvider                          │
│  ExcelAutobitsAdapter    LocalStorageProvider                      │
│  GoogleDriveStorageProvider (pendiente)                            │
│  ManualPaymentProvider                                             │
│  SQLiteRepository → PostgreSQLRepository (futuro)                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Pipeline Document AI (evolución del actual)

```text
Archivo recibido
    ↓
StorageProvider.save()           ← LocalStorageProvider
    ↓
ProcessingJob (PENDING)        ← cola / background task
    ↓
Detección tipo documento         ← IA + heurísticas
    ↓
Preprocesamiento (OpenCV)        ← preprocesamiento.py
    ↓
OCR + fallback                 ← ocr.py
    ↓
Extracción IA (JSON)           ← ia_ollama.py
    ↓
ConfidenceScorer               ← NUEVO
    ↓
RuleEngine                     ← validador.py → motor extensible
    ↓
Persistencia Document          ← SQLite
    ↓
MatchingEngine (si hay Autobits) ← NUEVO
    ↓
AccountCrossing + estados      ← NUEVO
    ↓
Remediation (si aplica)        ← NUEVO
```

Separación IA vs reglas:

```text
IA          → leer, interpretar, clasificar, extraer, resumir
REGLAS      → validar NIT, totales, relaciones, estados, subsanaciones
HUMANO      → aprobar matches probables, pagos, excepciones
```

### 3.3 Modelo de datos mínimo (SQLite → PostgreSQL)

```text
Provider ──────< Document >────── ProcessingJob
                    │
                    ├── ValidationResult
                    ├── AccountCrossing ──> AutobitsRecord
                    │         │
                    │         ├── Purchase
                    │         └── Reservation
                    ├── Remediation
                    ├── Payment ──> PaymentReceipt
                    └── DigitalPackage

AuditLog (transversal)
ImportBatch (Autobits Excel)
ColumnMapping (Autobits)
Rule (configurable)
```

**Entidades clave:**

| Entidad | Propósito |
|---------|-----------|
| `Document` | Factura, cuenta de cobro, comprobante, ingreso |
| `Provider` | Proveedor normalizado (NIT, nombre) |
| `AutobitsRecord` | Fila importada del Excel semanal |
| `Purchase` / `Reservation` | Relaciones de negocio |
| `AccountCrossing` | Resultado cruce documento ↔ Autobits |
| `ValidationResult` | Salida rule engine + confidence |
| `Remediation` | Subsanación |
| `Payment` | Pago pendiente / aprobado / ejecutado |
| `PaymentReceipt` | Comprobante asociado |
| `DigitalPackage` | Paquete para Katherine |
| `ProcessingJob` | Trabajo async OCR+IA |
| `AuditLog` | Trazabilidad contable |

### 3.4 Máquina de estados del documento

```text
RECIBIDO → PROCESANDO → EXTRAIDO → VALIDANDO → CRUZANDO
    → APROBADO → PENDIENTE_PAGO → PAGADO → COMPROBANTE_RECIBIDO
    → AUTOBITS_PENDIENTE → AUTOBITS_ACTUALIZADO → PAQUETE_DIGITAL
    → ENTREGADO → FINALIZADO

Alternativas: ERROR | REQUIERE_REVISION | SUBSANACION | DUPLICADO
```

### 3.5 Estructura de carpetas propuesta (incremental)

```text
src/
├── main.py                          # LEGACY batch — delega a servicios
├── api_server.py                    # App factory — monta routers
├── config/
│   └── settings.py                  # pydantic-settings
├── domain/
│   ├── entities/
│   ├── enums/
│   ├── rules/                       # Rule Engine
│   └── matching/                    # Matching Engine
├── application/
│   └── services/                    # Casos de uso
├── infrastructure/
│   ├── ocr/                         # TesseractOCRProvider
│   ├── ai/                          # OllamaAIProvider
│   ├── autobits/                    # ExcelAutobitsAdapter
│   ├── storage/                     # LocalStorageProvider
│   ├── payments/                    # ManualPaymentProvider
│   └── persistence/                 # SQLAlchemy + repos
├── api/
│   └── routers/                     # documents, crossings, payments...
├── legacy/                          # Wrappers compatibilidad POC
│   ├── ocr.py → re-export
│   ├── ia_ollama.py
│   └── ...
└── jobs/                            # ProcessingJob worker

frontend/src/app/
├── core/                            # layout, nav, auth futuro
├── shared/                          # tables, badges, toasts
└── features/
    ├── dashboard/
    ├── documents/
    ├── processing/
    ├── autobits/
    ├── crossings/
    ├── payments/
    ├── receipts/
    ├── remediations/
    ├── packages/
    └── reports/
```

### 3.6 API por dominios

| Prefijo | Responsabilidad |
|---------|-----------------|
| `GET /api/health` | **Legacy** — mantener |
| `POST /api/procesar` | **Legacy** — mantener durante transición |
| `/api/documents` | CRUD documentos, upload, detalle |
| `/api/processing` | Jobs, estado, re-procesar |
| `/api/autobits` | Import Excel, registros, mapeo |
| `/api/crossings` | Cruce, matching, aprobación |
| `/api/payments` | Pagos, estados, export |
| `/api/receipts` | Comprobantes |
| `/api/remediations` | Subsanaciones CRUD |
| `/api/packages` | Paquetes digitales |
| `/api/reports` | Reportes semanales, KPIs |
| `/api/audit` | Historial |

Todos con **Pydantic** request/response y documentación OpenAPI automática.

### 3.7 Adapters (interfaces)

```python
# Conceptual — no implementar integraciones falsas

class OCRProvider(Protocol):
    def extract_text(self, image_path: Path) -> OCRResult: ...

class AIProvider(Protocol):
    def extract_document(self, text: str, schema: str) -> ExtractionResult: ...

class AutobitsAdapter(Protocol):
    def import_report(self, file: Path, mapping: ColumnMapping) -> ImportResult: ...
    def find_provider(self, nit: str) -> Provider | None: ...
    def get_purchase(self, purchase_id: str) -> Purchase | None: ...
    def mark_payment_ready(self, record_id: str) -> None: ...  # export, no API fake

class StorageProvider(Protocol):
    def save(self, file: bytes, path: str) -> str: ...
    def get(self, path: str) -> bytes: ...

class PaymentProvider(Protocol):
    # ManualPaymentProvider — solo estados, sin Bancolombia
    def list_pending_execution(self) -> list[Payment]: ...
```

Implementaciones iniciales:

| Interface | v1 | Futuro |
|-----------|-----|--------|
| `OCRProvider` | `TesseractOCRProvider` | — |
| `AIProvider` | `OllamaAIProvider` | Otro modelo local |
| `AutobitsAdapter` | `ExcelAutobitsAdapter` | `ApiAutobitsAdapter` |
| `StorageProvider` | `LocalStorageProvider` | `GoogleDriveStorageProvider` |
| `PaymentProvider` | `ManualPaymentProvider` | — |

### 3.8 Frontend Angular (evolución)

**Conservar:** Angular 19, standalone components, SCSS, build actual, pywebview.

**Añadir:**

- Angular Router con layout sidebar empresarial
- Módulos por feature (lazy loading)
- Servicios HTTP por dominio
- Componentes compartidos: tabla, filtros, badges de estado, modales, toasts
- Estados loading / empty / error en cada vista
- Dashboard con KPIs y filtros semana (sábado–viernes)

**No reescribir** el componente de procesamiento actual; migrarlo a `features/processing/`.

### 3.9 Configuración centralizada

```env
# .env.example
DATABASE_URL=sqlite:///./data/contable.db
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_TIMEOUT=90
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
STORAGE_PROVIDER=local
STORAGE_ROOT=./storage
AUTOBITS_PROVIDER=excel
GOOGLE_DRIVE_ENABLED=false
LOG_LEVEL=INFO
MAX_UPLOAD_MB=20
```

### 3.10 Procesamiento asíncrono

```text
POST /api/documents/upload
  → crea Document (RECIBIDO) + ProcessingJob (PENDING)
  → responde 202 Accepted con job_id

Background worker (thread / asyncio task / celery futuro):
  → PROCESSING → OCR → IA → VALIDATING → COMPLETED | FAILED | REQUIRES_REVIEW

Frontend polling o WebSocket:
  → GET /api/processing/{job_id}
```

---

## 4. Compatibilidad con la POC

| Componente | Estrategia |
|------------|------------|
| `main.py` | Mantener CLI; internamente usar `DocumentProcessingService` |
| `/api/procesar` | Wrapper sobre servicio; respuesta igual |
| `salidas/*.csv` | Generar como **export**, no como BD |
| `dataset/imagenes/` | Soportar como origen batch legacy |
| Tesseract + Ollama | Sin cambio de tecnología en v1 |
| Angular UI actual | Mover a módulo Processing; no eliminar |

---

## 5. Plan de implementación por fases

### Fase 1 — Arquitectura base (prioridad inmediata)

- [ ] `config/settings.py`
- [ ] SQLAlchemy + SQLite + migraciones (Alembic)
- [ ] Entidades base + repositorios
- [ ] Adapters OCR/AI (wrap código existente)
- [ ] `DocumentProcessingService` unificado
- [ ] Tests smoke OCR + API health
- [ ] Mantener `main.py` y `/api/procesar` funcionando

**Criterio de salida:** batch POC produce mismos resultados; nuevo servicio persiste en SQLite.

### Fase 2 — Documentos

- [ ] CRUD `/api/documents`
- [ ] Upload con validación (extensión, tamaño, hash)
- [ ] Confidence score
- [ ] Detección duplicados
- [ ] Estados del documento
- [ ] UI Documentos + detalle

### Fase 3 — Autobits

- [ ] `ExcelAutobitsAdapter`
- [ ] Importador con preview y mapeo columnas
- [ ] Persistencia `AutobitsRecord`, `Purchase`, `Reservation`
- [ ] UI Autobits

### Fase 4 — Cruce de cuentas

- [ ] `MatchingEngine` (exacto / probable / sin match)
- [ ] `RuleEngine` extensible
- [ ] `AccountCrossing` + UI tabla cruce
- [ ] Aprobación humana

### Fase 5 — Subsanaciones

- [ ] Creación automática desde reglas
- [ ] CRUD + estados + responsables
- [ ] UI Subsanaciones

### Fase 6 — Pagos y comprobantes

- [ ] `ManualPaymentProvider`
- [ ] Estados pago (sin Bancolombia)
- [ ] Upload comprobante + validación
- [ ] UI Pagos + Comprobantes

### Fase 7 — Storage y paquetes

- [ ] `LocalStorageProvider` con estructura `/YYYY/MM/TIPO/`
- [ ] `GoogleDriveStorageProvider` stub
- [ ] `DigitalPackage` + UI

### Fase 8 — Dashboard y reportes

- [ ] KPIs, filtros semana sáb–vie
- [ ] Reportes exportables
- [ ] Layout sidebar completo

### Fase 9 — Tests e integración

- [ ] Tests unitarios rule engine, matching, import
- [ ] Tests API e2e
- [ ] Dataset demo (casos del prompt maestro)
- [ ] README actualizado

---

## 6. Decisiones técnicas

| Decisión | Elección | Razón |
|----------|----------|-------|
| BD desarrollo | SQLite | Local, cero config, portable |
| BD producción futura | PostgreSQL | Relaciones, concurrencia |
| ORM | SQLAlchemy 2.x | Estándar Python, migraciones |
| API | FastAPI + Pydantic v2 | Ya en proyecto, OpenAPI |
| Frontend | Angular 19 (actual) | No reescribir |
| Desktop | pywebview + Angular | Ya funciona |
| Jobs v1 | BackgroundTasks / threading | Sin Redis inicialmente |
| Tests | pytest + httpx | Backend; Jasmine/Karma frontend |

---

## 7. Lo que NO se implementará en v1

- Login automatizado Bancolombia
- API Autobits inventada
- API DIAN / WhatsApp Web scraping
- Google Drive sin credenciales reales
- Decisiones contables 100% automáticas
- Pagos ejecutados por el sistema

---

## 8. Referencias internas

- Requisitos funcionales: [`REQUISITOS_CONTABLES.md`](./REQUISITOS_CONTABLES.md)
- Código POC: `src/`, `frontend/`
- README original: `README.md`

---

## 9. Próximo paso

Tras aprobación de este diseño, iniciar **Fase 1** sin modificar comportamiento visible del batch legacy.  
Cada fase incluirá: explicación → archivos afectados → implementación → tests → verificación compatibilidad.
