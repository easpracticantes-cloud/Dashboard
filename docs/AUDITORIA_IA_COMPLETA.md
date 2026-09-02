# Auditoría completa de Inteligencia Artificial — SIG Escuela Aves Salento

**Fase 0 — Solo análisis (sin cambios de código)**  
**Fecha:** 2026-09-02  
**Alcance:** IA Contable (`contabilidad-service`) + IA Comercial / Cotizador (backend SIG + frontend) + Google Sheets + providers  
**Regla de esta fase:** entender, documentar y criticar. No implementar.

---

## 0. Resumen ejecutivo

El proyecto **no tiene una sola IA**. Tiene **dos stacks independientes** (Contabilidad FastAPI vs SIG Spring) y, dentro del cotizador comercial, **tres cerebros de precio** que no comparten fuente de verdad.

| Área | Estado real | Veredicto |
|------|-------------|-----------|
| Contabilidad OCR + Gemini/Ollama | Funciona parcialmente | El path que usa la UI **no extrae JSON estructurado de factura** |
| Matching Autobits | Determinístico y útil | Queda hambriento de campos cuando el OCR UI falla |
| Ave / Consola cotizador | Gemini + catálogo JSON | Mejor diseño del proyecto: LLM interpreta, Java calcula |
| Cotización desde Inbox CRM | Heurística + precios hardcodeados | **Inconsistente** con catálogo oficial |
| Google Sheets → LLM | Indirecto vía CRM | Sheets **no** es el catálogo de tarifas de la IA |
| Claude / OpenAI / DeepSeek | Stubs | No aportan producción |
| Ollama | Solo Contabilidad | No existe en el cotizador SIG |

**Problema estructural dominante:** la IA todavía opera en varios puntos como *texto → LLM → texto*, aunque ya existen piezas de orquestación, reglas y catálogo que apuntan al modelo deseado (*datos + reglas + IA + validación*).

---

## 1. Mapa del sistema (quién es quién)

```text
┌──────────────────────── FRONTEND ANGULAR ────────────────────────┐
│  /app/contabilidad/*     /app/ai (Consola)     Ave copiloto      │
│  Inbox → quote dialog    Conversaciones assist                   │
└───────────────┬──────────────────────┬───────────────┬───────────┘
                │ JWT                  │               │
                ▼                      ▼               ▼
     ContabilidadProxyController   GenerativeAiController / AiController
                │                      │
                ▼                      ▼
     FastAPI contabilidad-service   Spring SIG (hexagonal AI)
     Gemini | Ollama + Tesseract    Gemini (+ stubs Claude/OpenAI)
                │                      │
                ▼                      ▼
           SQLite contable      PostgreSQL + ai/catalogo/*.json
                │                      │
                └────── Sheets ────────┘
                   (dashboard/CRM sync; no tarifas IA)
```

### Componentes clave

| Componente | Ruta | Rol |
|------------|------|-----|
| Contabilidad API | `contabilidad-service/src/` | OCR, extracción, Autobits, matching, pagos |
| BFF Contabilidad | `ContabilidadProxyController.java` | Proxy JWT → FastAPI |
| IA comercial | `backend/.../application/ai/` | Ave, cotizador, actions, memory |
| Providers SIG | `GeminiAdapter.java` + stubs | Solo Gemini vivo |
| Providers Contab. | `ai_factory.py`, `gemini_provider.py`, `ollama_provider.py` | Gemini preferido |
| Catálogo tarifas | `backend/src/main/resources/ai/catalogo/` | SoT de precios Ave/enterprise |
| Sheets | `SheetsSyncService`, `SheetsPayloadMapper`, Apps Script | CRM + dashboard |

---

## 2. IA CONTABLE — Auditoría detallada

### 2.1 Cómo recibe facturas hoy

| Canal | Endpoint / UI | Qué ocurre |
|-------|---------------|------------|
| UI Documentos | `POST /api/v1/contabilidad/documents/upload` → FastAPI `/api/documents/upload` | Guarda archivo, hash duplicado, `auto_procesar=true` → `process_by_id` |
| UI Procesar | `POST /api/procesar` | Legacy interactivo |
| CLI batch | `contabilidad-service/src/main.py` | `process_invoice_batch` (estructurado) |
| Autobits Excel | `/api/autobits/**` | No es factura; mapeo de columnas con IA |

**Hallazgo crítico:** el upload de Documentos llama `process_by_id` → **`process_interactive`** (texto libre), **no** `process_invoice_batch` / `extract_invoice` (JSON).

Solicitud hardcodeada en upload:

> “Extrae numero de factura, proveedor, NIT, fecha… compra y reserva.”

Pero el modelo responde en **prosa** vía `extract_custom`, no en el schema de factura.

### 2.2 OCR

| Pieza | Ubicación | Comportamiento |
|-------|-----------|----------------|
| Tesseract | `ocr.py`, `tesseract_provider.py` | `spa+eng` con fallback `spa` |
| Preproceso | `preprocesamiento.py` / OpenCV | Resize 1200–2200, gris, median blur |
| Selección | original vs preprocesado | Elige el texto “mejor” (keywords sesgados a inglés) |
| Umbral débil | `min_caracteres_ocr` = 100 | Si OCR &lt; 100 → Gemini Vision (si provider=gemini) |
| PDF | Extensión permitida | **No hay pipeline PDF→imagen**; OCR espera imagen |

**Fortalezas:** fallback visión Gemini en Render; health check de Tesseract; preprocess ligero.  
**Debilidades:** sin deskew, sin tablas, sin multipágina, keywords poco colombianos (Factura electrónica / CUFE / NIT infra-ponderados).

### 2.3 Qué información extrae (schema real)

Prompt estructurado (`INVOICE_JSON_PROMPT` en `gemini_provider.py` / `ia_ollama.py`):

| Campo | Extraído en batch | Extraído en UI upload |
|-------|-------------------|------------------------|
| tipo_documento | Sí (plano) | No (prosa) |
| numero_factura | Sí | No persistido típico |
| proveedor | Sí | No |
| nit_o_identificacion | Sí | No |
| fecha_emision | Sí | No |
| subtotal / impuesto / total / moneda | Sí | No |
| concepto_general | Sí | No |
| campos_faltantes / requiere_revision | Sí | Parcial vía confidence débil |
| compra / reserva | **No en prompt** | Pedidos en texto libre; casi nunca estructurados |
| line items / CUFE / retenciones / vencimiento | **No** | No |
| Nested RF-PROC-03 | Documentado, **no implementado en prompts** | — |

Persistencia (`DocumentModel`): columnas planas + `extracted_json` + `ocr_text` + `confidence_global`.

### 2.4 Limpieza OCR → envío a IA

1. Preproceso imagen.  
2. OCR original y preprocesado.  
3. Score heurístico de texto.  
4. Si texto suficiente → `extract_invoice(ocr_text)` **o** `extract_custom(ocr_text, solicitud)`.  
5. Si débil → visión Gemini (solo Gemini; Ollama sin vision methods útiles).

No hay normalización semántica previa (regex NIT, fechas CO, moneda COP) antes del LLM.

### 2.5 Modelo y configuración

| Variable | Default / notas |
|----------|-----------------|
| `AI_PROVIDER` / `APP_AI_PROVIDER` | `gemini` |
| `GEMINI_MODEL` | `gemini-2.0-flash` + fallbacks |
| `GEMINI_TIMEOUT` | 90s |
| `GEMINI_VISION_ON_WEAK_OCR` | true |
| `OLLAMA_URL` / `OLLAMA_MODEL` | localhost / llama3.2 |
| Temperatura Gemini | ~0.2 |
| Fallback sin key | **Silencioso a Ollama** (confunde deploys Render) |

### 2.6 Prompts

| Prompt | Calidad | Problema |
|--------|---------|----------|
| Invoice JSON texto | Aceptable POC | Plano; sin line items; duplicado Gemini/Ollama |
| Invoice vision | Aceptable | Solo Gemini |
| Custom / interactivo | Débil para contabilidad | Path principal de UI |
| Excel Autobits mapping | El más maduro | Valida nombres reales de columnas |

### 2.7 Validación

**Determinística (existe):**

- `validador.validar_factura` — requiere número, proveedor, fecha, total numérico, tipo factura.  
- `RuleEngine.evaluate_invoice` / `evaluate_crossing` — estados y remediaciones.  
- Matching ponderado documento ↔ Autobits.  
- Confidence por **presencia** de campos (no logprobs del modelo).

**No determinístico / ausente:**

- No valida `subtotal + IVA ≈ total`.  
- No valida NIT (dígito verificación).  
- Path interactivo **salta** `RuleEngine.evaluate_invoice`.  
- LLM `requiere_revision` se mezcla sin peso claro.

### 2.8 Confidence score

`confidence_scorer.py`:

- Campo presente → 95; ausente → 0.  
- Factor OCR `chars/200`.  
- Umbral revisión global &lt; 75.

**No es confidence real del modelo.** No hay `{ valor, confianza, fuente }` por campo en el sentido pedido.

### 2.9 Duplicados

| Método | Estado |
|--------|--------|
| Hash de archivo | Real, en upload |
| Metadata número + total | Parcial |
| NIT en metadata | **Parámetro ignorado** en `check_metadata` |
| Fecha + proveedor + similaridad contenido | No |

### 2.10 Matching / cruce Autobits

`MatchingEngine`:

- Pesos: compra/doc, NIT, nombre, reserva, valor, fecha.  
- Tipos: exacto (≥85) / probable (≥55) / sin match.  
- Reasons listadas.  
- `RuleEngine` genera remediaciones.

**Dependencia crítica:** necesita `numero_documento`, NIT, total, compra/reserva en el documento. El path UI no los llena → matching queda vacío o manual (Autobits-first + completar FACTURA/CDC a mano).

### 2.11 Autobits

- Provider real: **Excel** (`AUTOBITS_PROVIDER=excel`).  
- IA mapea columnas (`ExcelAIAnalyzer`) con fallback heurístico.  
- No hay API Autobits viva; no inventar una.  
- Seed crossings desde último Excel.

### 2.12 Formatos / multipágina / PDF / imagen

| Formato | Soporte |
|--------|---------|
| JPG/PNG | Real |
| PDF | Allowlist sí, OCR no |
| Multipágina | No |
| TIFF / email | No |
| Drive storage | Stub |

### 2.13 Relación con histórico

- SQLite local (efímero en Render free sin disco persistente).  
- No hay ledger histórico multi-periodo con IA.  
- No DIAN.  
- No cruce bancario automático (Bancolombia stub/out of scope).

### 2.14 Frontend contable y UX IA

- Muestra `%` confidence, `respuesta_ia` en Procesar, estados de documento.  
- Progress bar de procesamiento **simulado** (pipeline síncrono).  
- No guía clara “campo seguro vs revisar” con fuente.

---

## 3. IA DEL COTIZADOR / COMERCIAL — Auditoría detallada

### 3.1 Tres stacks paralelos

| Stack | Entrada | Precio | Persistencia |
|-------|---------|--------|--------------|
| **A. Ave copiloto** | Chat shell | `CatalogQuoteService` ← `ai/catalogo/` | Memoria sesión; PDF cliente; **no** Quote CRM |
| **B. Consola / QuotationOrchestrator** | `POST /ai/quotation` | Catálogo JSON (+ PG fallback) + reglas | Response estructurada |
| **C. Inbox CRM quote** | Conversation detail | `HeuristicChatQuoteAnalyzer` precios **hardcodeados** | Crea `QuoteEntity` + PDF |

Esto es el mayor riesgo comercial: **el mismo tour puede cotizarse a montos distintos** según la pantalla.

### 3.2 De dónde salen servicios / tarifas / proveedores

| Dato | Fuente real | ¿Sheets? |
|------|-------------|----------|
| Productos / escalas por pax | `ai/catalogo/productos.json` (~83) | No |
| Proveedores catálogo | `ai/catalogo/proveedores.json` | No |
| Reglas jeep/guías/paquetes | `meta.json` | No |
| Tour products PG | Fallback JPA | No |
| Seguimientos / ventas / B2B | Google Sheets → dashboard/CRM | Sí, ops |
| Solicitud/respuesta WhatsApp | Sheets → mensajes CRM | Indirecto a LLM vía chat |

**Sheets no alimenta el motor de precios de Ave/enterprise.** El catálogo es JSON estático (requiere redeploy/restart al cambiar tarifas).

### 3.3 Pipeline Ave

```text
Mensaje → memoria (últimos 16 turns) + índice catálogo en system prompt
       → Gemini chat
       → (opcional) JSON mode QUOTE|PROVIDERS
       → CatalogQuoteService.quote() determinístico
       → UI review / PDF local
```

### 3.4 Pipeline QuotationOrchestrator (el más cercano al ideal)

```text
Mensaje
 → interpretQuote (Gemini JSON) | HeuristicQuoteInterpreter
 → RuleEngine soft
 → TourPricingPort (CatalogAware → JSON first)
 → Checklist + Recommendations
 → narrative opcional (Gemini)
 → QuotationResponse
```

**Aquí el LLM no calcula el total final:** Java hace `people × unitPrice` (+ flags de reglas).

### 3.5 Pipeline Inbox (el más frágil)

```text
Mensajes conversación
 → HeuristicChatQuoteAnalyzer (regex + EXPERIENCES hardcode 50k–95k)
 → Claude enrich (siempre DISABLED)
 → createQuote CRM
```

No usa `ai/catalogo/`. Comentarios del código hablan de chats “proyectados desde Sheets”, pero el precio no viene de Sheets.

### 3.6 Intent / entidades / missing data

| Capacidad | Estado |
|-----------|--------|
| Intent detector dedicado | No (classifyConversation / modo Ave) |
| Entity extraction cotización | Sí (JSON Gemini + heurística) |
| Slot-filling multi-turn formal | Débil (memoria Ave + 1 pregunta en prompt) |
| Missing data detection estructurado | Parcial; no pipeline explícito |
| B2B vs B2C diferenciado | Catálogo/meta tiene tipologías; UX débil |
| Idiomas | Endpoint detect; no cotización multilingüe completa |
| Disponibilidad / capacidad | No en quote engine |
| Temporadas / festivos / FX / IVA línea | Catálogo tiene hints; motor no modela VAT claro |
| Descuentos agencia / márgenes | No first-class en motor Ave |

### 3.7 Construcción de cotización y precios

**Correcto (A/B):** precio desde `priceScaleByPax` / modality PRIVADO|COMPARTIDO; transporte/restaurant a menudo forzados a 0 en adapter para evitar doble conteo.  
**Incorrecto (C):** tabla EXPERIENCES propia.  
**En prompt Ave:** reglas jeep &gt;4 privado / ≤4 público (lógica de negocio en prompt, no solo en motor).

### 3.8 Memoria conversacional

- Ave: `ConversationMemoryJpaAdapter` (PG).  
- CRM: historial completo de mensajes, no unido a sesión Ave.  
- No hay state machine de slots (`personas`, `fecha`, `servicios`) versionado.

### 3.9 Actions / tools

`ActionOrchestrator` + tools mutantes (cliente, reserva, mensaje, quote from conversation) con `confirm=true`.  
Ave **no** usa ese registry: emula tools vía JSON en el prompt.

### 3.10 Respuestas

- Ave: markdown libre + quote estructurado ocasional.  
- Enterprise: DTO estructurado.  
- CRM assist: heurística texto (Claude stub).  
- Riesgo: “inventar precios” mitigado por prompt, pero **fuga de catálogo completo al contexto** (tokens + posible alucinación si falla el mode QUOTE).

---

## 4. Google Sheets e IA

### Hojas relevantes

Seguimientos mensuales, `VENTAS`, `ESTADISTIC*`, `PAÍSES`, `TOQUES`, `PIEZAS PUB`, `PARAMETRIZACION B2B…`.

### Columnas seguimiento (aliases)

FECHA, TIPO, CANAL, CLIENTE, CELULAR, SOLICITUD, RESPUESTA, SEMAFORO, COTIZADO, MONTO, NOTAS, FECHA SERVICIO, ENCUESTA, ASIGNADO, PROXIMO SEGUIMIENTO, DISC, PRIORIZAR, PENDIENTE, OBJECION, EXCELENTE/BUENA/REGULAR, REGISTRADO.

### Uso para IA

| Uso | ¿Correcto hoy? |
|-----|----------------|
| Dashboard operativo editable | Sí (post cleanup UI) |
| Sync a CRM mensajes | Sí |
| Contexto semántico de tarifas para cotizar | **No** — catálogo JSON |
| Enviar matrices crudas al LLM | No ocurre (bien) |
| Context retrieval semántico tipo “Tour café…” desde Sheets | **No existe** |

### Diseño deseable (Fases posteriores)

Construir **context cards** semánticos desde catálogo (+ opcionalmente parámetros B2B de Sheets), nunca filas crudas tipo “Fila 348”.

---

## 5. Providers, stubs y configuración cruzada

| Provider | SIG | Contabilidad |
|----------|-----|--------------|
| Gemini | Real `@Primary` | Real |
| Ollama | No | Real |
| Claude | Stub | No |
| OpenAI / DeepSeek | Stub | No |
| Heurísticos | Quote/assist/interpreter | Excel mapping fallback |

Env compartidos de nombre: `APP_AI_PROVIDER`, `GEMINI_*` (buena decisión Render).  
Docker Contabilidad: Ollama listo; Gemini key a menudo ausente en compose.

---

## 6. Observabilidad, seguridad, costos

### Observabilidad

- SIG: `AiUsageLog` (endpoint, provider, latency, tokens estimados, error truncado) + UI “Uso IA”.  
- Contabilidad: logs + health; sin tabla de uso LLM equivalente.

### Seguridad

- Keys Gemini en query string (patrón API Google).  
- Prompt injection: chats/OCR/Excel concatenados; `systemPrompt` custom en chat SIG.  
- Uploads Contabilidad hasta `MAX_UPLOAD_MB`; sin sandbox de “instrucciones en factura”.  
- Actions mutantes con confirm (mitigación parcial).  
- Sheets write token opcional.

### Costos / rendimiento

- Ave inyecta índice grande de catálogo → tokens altos.  
- Contabilidad síncrona OCR+LLM en HTTP → timeouts proxy.  
- Fallbacks de modelo Gemini rotan bien.  
- No hay cola async real pese a modelo `ProcessingJob`.

---

## 7. Testing actual

| Área | Tests | Suficiencia |
|------|-------|-------------|
| QuotationOrchestrator / ActionOrchestrator / AIService | Unit Java | Parcial; sin Gemini HTTP real |
| Matching / confidence / rules / excel AI | Pytest | Útiles pero no cubren path UI interactivo |
| E2E contable | Existe | No demuestra extracción estructurada en upload UI |
| Casos cotizador incompleto / B2B / multi-turn | Débiles | Faltan |

---

## 8. Lo que ya está bien (no romper)

1. Separación Contabilidad FastAPI ↔ SIG Spring.  
2. `QuotationOrchestrator`: interpret → rules → pricing → narrative.  
3. Catálogo JSON con `neverInventPrices`.  
4. Matching Autobits determinístico con reasons.  
5. Hexagonal ports AI en SIG.  
6. Observabilidad de uso en SIG.  
7. Confirm gate en actions mutantes.  
8. Visión Gemini como fallback OCR débil.

---

## 9. Prioridades objetivas (para fases siguientes)

### P0 — Bugs que invalidan valor

1. Contabilidad UI: usar `extract_invoice` / batch path, no `extract_custom`.  
2. Unificar precios Inbox con `ai/catalogo/` (eliminar EXPERIENCES hardcode o mapearlos).  
3. Persistir compra/reserva en schema de extracción.

### P1 — Fundación

4. Schemas JSON unificados + confidence `{valor, confianza, fuente}`.  
5. Validación matemática determinística.  
6. Duplicados con NIT+fecha+proveedor.  
7. Intent/entities/missing-data pipeline formal en cotizador.  
8. Context builder semántico (no dump catálogo completo).

### P2 — Producto

9. PDF multipágina OCR.  
10. Async jobs + progress real.  
11. Ave → persist Quote CRM.  
12. Memoria de slots multi-turn.  
13. Tests de casos reales.

---

## 10. Archivos canónicos a tocar en fases futuras

### Contabilidad

- `document_processing_service.py`, `documents.py` (router)  
- `gemini_provider.py`, `ia_ollama.py`, `ai_factory.py`  
- `confidence_scorer.py`, `duplicate_detector.py`, `matching_engine.py`, `rule_engine.py`  
- Frontend `features/contabilidad/**`

### Cotizador

- `QuotationOrchestrator.java`, `CopilotOrchestrator.java`, `CatalogQuoteService.java`  
- `CommercialCatalogService.java`, `HeuristicChatQuoteAnalyzer.java`  
- `GeminiAdapter.java`, `GenerativeAiController.java`, `AiController.java`  
- `ai/catalogo/*`, Ave UI, Consola IA, `ai-quote-dialog`

### Sheets (contexto, no precios)

- `SheetsPayloadMapper.java`, `SheetsSyncService.java`, `google_sheets_webapp_write.gs`

---

## 11. Conclusión Fase 0

La IA del proyecto **ya no es un chatbot vacío**: hay orquestadores, catálogo, reglas y matching. Pero **sí sigue siendo frágil** donde el path de producción no usa esas piezas (upload contable interactivo; cotización Inbox heurística).

El salto pedido — de *LLM conectado* a *capa inteligente de negocio* — es viable **sin rewrite total**, unificando paths y sacando la lógica crítica del prompt y de tablas hardcodeadas.

**Siguiente paso autorizado por el usuario:** esperar aprobación para Fases 1+ (implementación).  
Documentos hermanos de esta auditoría:

- `docs/FLUJO_IA_ACTUAL.md`  
- `docs/PROBLEMAS_IA.md`  
- `docs/ARQUITECTURA_IA_PROPUESTA.md`
