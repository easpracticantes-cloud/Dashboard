# Arquitectura de IA propuesta

**Fase 0** · Diseño objetivo · 2026-09-02  
Basada en la auditoría as-is. **No implementada aún.**  
Principio: evolucionar lo que ya funciona (`QuotationOrchestrator`, catálogo JSON, MatchingEngine, Gemini Contabilidad) — no reescribir el monorepo.

---

## 1. Principios

1. **LLM interpreta; el sistema decide números y estados.**  
2. **Una fuente de verdad de precios** (`ai/catalogo/` → futuro port `TariffCatalogPort`).  
3. **Una fuente de verdad de extracción contable** (schema JSON + reglas).  
4. **Dos dominios separados:** `AI/Accounting` y `AI/Quotation` (ya casi lo están por servicios).  
5. **Context builder** antes del modelo: semántica, no filas crudas.  
6. **Output schema + validación** obligatorios en paths de negocio.  
7. **Human-in-the-loop** cuando confidence &lt; umbral o reglas fallan.  
8. **No inventar APIs** (Autobits, DIAN, Bancolombia, WhatsApp send): ports/adapters stubs honestos.

---

## 2. Arquitectura objetivo (adaptada al repo)

```text
                         FRONTEND (Angular)
                    Contabilidad UI │ Cotizador UI │ Ave │ Inbox
                                   ▼
                         API / BFF (Spring)
                    /contabilidad/**   /api/v1/ai/**
                                   ▼
                    ┌──────────────────────────────────┐
                    │     Domain AI Facades            │
                    │  AccountingAiFacade              │
                    │  QuotationAiFacade               │
                    └──────────────┬───────────────────┘
                                   ▼
                    ┌──────────────────────────────────┐
                    │        AI ORCHESTRATOR           │
                    │  (pipeline stages, no god-class) │
                    └──────────────┬───────────────────┘
           ┌───────────────┬───────┴────────┬────────────────┐
           ▼               ▼                ▼                ▼
    ContextBuilder   RulesEngine     AiProviderPort    Validator
           │               │                │                │
           ▼               ▼                ▼                ▼
    DataRetrieval    Deterministic    Gemini/Ollama     Schemas
    (catalog/OCR/    calcs & gates    structured out    + confidence
     Autobits/CRM)
                                   ▼
                          Business Result DTO
                          + audit / usage log
```

### Por qué no copiar literal el árbol pedido

El repo ya tiene:

- Contabilidad en **FastAPI** (mejor dejar OCR/Python ahí).  
- Cotizador en **Spring hexagonal**.

Forzar un solo runtime destruiría lo bueno. La unificación es de **contratos y pipelines**, no de un solo JAR.

```text
AI
├── Accounting   (contabilidad-service)     ← Python
│   ├── DocumentClassifier
│   ├── InvoiceExtractor
│   ├── OcrProcessor
│   ├── AccountingValidator
│   ├── MatchingEngine          (ya existe)
│   └── AccountingAssistant     (Q&A sobre doc ya estructurado)
│
└── Quotation    (backend SIG)              ← Java
    ├── IntentDetector
    ├── EntityExtractor
    ├── ContextRetriever
    ├── PricingEngine           (CatalogQuote + Orchestrator unificados)
    ├── RecommendationEngine    (ya parcialmente)
    └── QuotationAssistant      (Ave sobre el mismo motor)
```

---

## 3. Pipeline canónico (ambos dominios)

```text
INPUT
  → NORMALIZE
  → INTENT / DOC-TYPE
  → ENTITY / FIELD EXTRACTION   (IA o heurística)
  → CONTEXT RETRIEVAL           (solo lo necesario)
  → BUSINESS RULES              (determinístico)
  → PRICE / MATH ENGINE         (determinístico)   [solo cotizador]
  → AI NARRATIVE / EXPLAIN      (opcional)
  → OUTPUT VALIDATION + CONFIDENCE
  → PERSIST + AUDIT
  → UI (mostrar valor / confianza / fuente / revisar)
```

Contrato interno sugerido (adaptar por dominio):

```json
{
  "intent": "QUOTE_REQUEST | INVOICE_EXTRACT | ...",
  "entities": {},
  "missing_information": [],
  "context_refs": ["catalog:ACAIME", "autobits:123"],
  "calculation": {},
  "fields": {
    "total": { "valor": 150000, "confianza": 0.91, "fuente": "OCR+IA+REGLA" }
  },
  "confidence": 0.91,
  "requires_human_review": false,
  "response": "texto usuario",
  "warnings": []
}
```

---

## 4. Capa de ingesta y contexto (prioridad)

### 4.1 Contabilidad

```text
Archivo
 → FileGuard (magic bytes, size, pages)
 → PdfRasterizer | ImageLoader
 → OcrProcessor (preprocess + Tesseract + score)
 → WeakOcrFallback (Gemini Vision invoice schema)
 → InvoiceExtractor (JSON schema único)
 → FieldNormalizer (NIT, fechas CO, money COP)
 → ConfidenceComposer
 → AccountingValidator (math + required)
 → DuplicateDetector (hash + NIT+número+fecha+total)
 → Persist
 → MatchingEngine (si Autobits disponible)
```

**Context al LLM:** OCR limpio + hint de tipo doc + schema.  
**No enviar:** Excel Autobits completo, historial entero, prompts gigantes con reglas tributarias.

### 4.2 Cotizador

```text
User message + SessionSlotState
 → IntentDetector
 → EntityExtractor (merge slots)
 → MissingDataGate  → si faltan críticos: preguntar SOLO eso
 → ContextRetriever
      • top-K productos por keywords/embedding ligero o score actual
      • proveedores de esos códigos
      • reglas meta (jeep, guías)
      • opcional: tipología B2B desde Sheets parametrización (semántica)
 → PricingEngine (catálogo)
 → RulesEngine
 → NarrativeComposer (IA)
 → QuoteDraft DTO
```

**Context card ejemplo (sí):**

```text
SERVICIO
Código: TOUR_CAFE
Nombre: Tour de café
Modalidad: PRIVADO|COMPARTIDO
Idiomas: es, fr
Precio escala: {2:..., 4:...}
Condiciones: ...
```

**No:** dump de 83 productos ni “Fila 348” de Sheets.

### 4.3 ¿RAG?

- **Corto plazo:** retrieval por score/keywords del catálogo (ya hay snippets) — suficiente.  
- **RAG/pgvector:** solo si el catálogo crece mucho o entra documentación de políticas PDF. Hoy el stub no aporta; no instalar moda.

---

## 5. Separación IA vs reglas

| Responsabilidad | Motor |
|-----------------|-------|
| Clasificar doc / intent | IA (+ heurística fallback) |
| Extraer campos / entidades | IA |
| Normalizar NIT/fechas/moneda | Reglas |
| `subtotal+IVA≈total` | Reglas |
| Estados documento / cruce | Reglas |
| Precio unitario y total | PricingEngine |
| Descuentos/márgenes futuros | Reglas |
| Explicar cotización | IA |
| Matching score | Reglas (ya) |
| “¿Requiere revisión?” | Reglas sobre confidence + validaciones |

---

## 6. Confidence y revisión humana

Cada campo crítico:

```text
valor | confianza[0–1] | fuente(OCR|VISION|IA|REGLA|USUARIO) | evidencia opcional
```

Política sugerida:

| Global | Acción |
|--------|--------|
| ≥ 0.90 y reglas OK | Aceptar (editable) |
| 0.70–0.89 | Aceptar con banner revisión |
| &lt; 0.70 o reglas fail | Bloquear estados finales; cola revisión |
| Conflicto matching | CONFLICTO + reasons (ya parcialmente) |

UI debe listar campos bajos, no solo un % decorativo.

---

## 7. Matching y duplicados (evolución)

Mantener `MatchingEngine`; enriquecer:

- Alimentar siempre desde extracción estructurada.  
- Incluir `compra`/`reserva` en schema.  
- Exponer `MATCH_EXACTO | MATCH_PROBABLE | SIN_MATCH | CONFLICTO` + % + reasons (ya cerca).  
- Duplicados: hash OR (NIT + número + total≈ + fecha±N).

---

## 8. Cotizador: un solo PricingEngine

```text
HeuristicChatQuoteAnalyzer  ──deprecar precios──┐
CatalogQuoteService          ──unificar─────────┼→ PricingEngine
CatalogAwareTourPricingAdapter ─────────────────┘
        ▲
QuotationOrchestrator / CopilotOrchestrator / Inbox quote / Actions
```

Ave e Inbox deben producir el **mismo** `QuoteDraft` para el mismo input.

Memoria: `SessionSlotState` persistido (personas, fecha, idioma, servicios, modalidad, transporte, B2B/B2C).

---

## 9. Providers

| Tarea | Provider sugerido |
|-------|-------------------|
| Extracción factura / vision | Gemini flash (JSON) |
| Mapping Excel | Gemini flash |
| Interpret cotización | Gemini flash |
| Narrativa / Ave chat | Gemini flash (temp baja–media) |
| Fallback offline Contabilidad | Ollama JSON (explícito, no silencioso) |
| Claude/OpenAI | stubs honestos hasta contrato real |

No hace falta 3 modelos distintos el día 1; sí **perfiles de generación** (json_mode, temp, max tokens) por tarea.

---

## 10. Errores y resiliencia

- Timeout + retry acotado (ya parcial Gemini).  
- Fallback modelo lista (ya).  
- Fallback provider **explícito** en health/UI.  
- JSON corrupto → re-ask corto o heurística; nunca crashear UI.  
- Mensajes usuario: “No pudimos leer el documento; súbelo más nítido o revisa manual” — sin stack traces.  
- Cola async Contabilidad (Fase 7) para OCR+LLM.

---

## 11. Observabilidad

Unificar contrato de log (aunque tablas distintas al inicio):

```text
request_id, domain, operation, provider, model,
latency_ms, input_chars, context_refs_count,
success, validation_ok, confidence_global, error_code
```

Nunca loguear API keys; redactar NIT/celular en muestras.

---

## 12. Frontend (Fase 5)

### Contabilidad

- Vista campo a campo con confidence chip.  
- Diff OCR vs valor aceptado.  
- Botones: aceptar / corregir / enviar a cruce.  
- Progress real ligado a job id.

### Cotizador / Ave

- Panel de slots detectados + faltantes.  
- Desglose de precio (motor, no LLM).  
- “Guardar en CRM” desde Ave.  
- Inbox usa mismo componente de draft.

---

## 13. Testing (Fase 6)

### Contabilidad fixtures

- factura clara, OCR malo, sin NIT, sin IVA, con retención, duplicada, total inconsistente, multipágina, proveedor desconocido.

### Cotizador fixtures

- completa, incompleta, multi-turn slots, B2B, B2C, servicio inexistente, multi-servicio, cambio de personas mid-chat, idioma FR.

Asserts: schema válido, precio = motor, no inventa servicios fuera de catálogo, missing_information correcto.

---

## 14. Plan de implementación por fases (recordatorio)

| Fase | Objetivo | ¿Rompe prod? |
|------|----------|--------------|
| **0** | Auditoría (este paquete docs) | No |
| **1** | Contratos, schemas, errores, provider honesty, confidence model | Bajo |
| **2** | Contable: path estructurado UI, OCR/PDF, duplicados, matching feed | Medio (mejoras) |
| **3** | Cotizador: PricingEngine único, intent/slots, retrieval | Medio |
| **4** | Orquestación homogénea + facades | Bajo–medio |
| **5** | UX confianza / drafts / CRM bridge | Bajo |
| **6** | Tests reales | No |
| **7** | Async, tokens, retrieval fino | Bajo |

**Gate entre fases:** pruebas + endpoint + UI path real + comparación baseline.

---

## 15. Decisiones explícitas post-auditoría

| Decisión | Justificación |
|----------|---------------|
| Mantener FastAPI Contabilidad | OCR/Python maduro; no migrar a Java ahora |
| Mantener catálogo JSON como SoT precios | No hay API tarifas; Sheets no es tarifa |
| No bulk-Sheets→LLM | Correcto; construir cards semánticas si hace falta B2B |
| No activar Claude hasta key+adapter real | Evitar falsa capacidad |
| Unificar Inbox→PricingEngine | Elimina P0 comercial |
| Cablear upload→extract_invoice | Elimina P0 contable |
| RAG vectorial opcional diferido | Catálogo pequeño; score basta |

---

## 16. Resultado esperado al terminar Fases 1–7

De:

> “un LLM conectado al sistema”

A:

> “capa inteligente integrada al negocio”: datos reales → contexto mínimo → IA controlada → reglas → validación → UI con confianza.

Documento de cierre futuro (cuando se implemente): `docs/MEJORAS_IA_IMPLEMENTADAS.md`.

---

## Referencias

- As-is: `docs/AUDITORIA_IA_COMPLETA.md`, `docs/FLUJO_IA_ACTUAL.md`, `docs/PROBLEMAS_IA.md`  
- Requisitos contables existentes: `contabilidad-service/docs/REQUISITOS_CONTABLES.md`  
- Catálogo: `backend/src/main/resources/ai/catalogo/meta.json`
