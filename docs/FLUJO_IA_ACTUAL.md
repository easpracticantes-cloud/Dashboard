# Flujo actual de IA — end to end

**Fase 0** · Documento descriptivo (as-is) · 2026-09-02

Este documento traza **de dónde sale cada dato → transformación → modelo → validación → UI**, sin proponer aún la arquitectura objetivo (ver `ARQUITECTURA_IA_PROPUESTA.md`).

---

## 1. Vista general de flujos

```text
                         ┌─────────────┐
                         │   Usuario   │
                         └──────┬──────┘
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
         Contabilidad      Consola / Ave     Inbox CRM
                │               │               │
                ▼               ▼               ▼
         FastAPI Contab.   SIG GenerativeAI  SIG AiController
                │               │               │
         OCR→LLM→SQLite    Catálogo→Gemini   Heurística→Quote
                │               │               │
                ▼               ▼               ▼
         Matching Autobits  Quotation DTO    PDF / CRM
```

Google Sheets alimenta **dashboard + sync CRM**; no es el catálogo de precios de Ave.

---

## 2. Flujo IA CONTABLE

### 2.1 Path A — Upload Documentos (path de producto / UI)

```text
[Angular] DocumentsApiService.upload(file)
    │  Form: origen, tipo, auto_procesar=true
    ▼
[Spring] POST /api/v1/contabilidad/documents/upload
    │  ContabilidadProxyController (quita Authorization, reenvía multipart)
    ▼
[FastAPI] documents.upload_document
    │
    ├─► DocumentService.save_upload
    │     • guarda archivo en storage local
    │     • calcula file_hash
    │     • DuplicateDetector.check_file → DUPLICADO si hash igual
    │
    └─► si auto_procesar y no duplicado:
          DocumentProcessingService.process_by_id(id, solicitud_fija)
              │
              └─► process_interactive(path, solicitud)
                    1. verify Tesseract + AI provider
                    2. OpenCV preprocess
                    3. OCR original + preprocesado → mejor texto
                    4. si chars < 100:
                         Gemini extract_custom_from_image(solicitud)
                         else REQUIERE_REVISION
                    5. si chars OK:
                         AI.extract_custom(ocr_text, solicitud)  ← TEXTO LIBRE
                    6. score_invoice_extraction({respuesta_ia: "..."})
                         → fields casi todos 0; global bajo
                    7. update_extraction → estado EXTRAIDO
                         → columnas numero/total/proveedor suelen vacías
                    8. NO llama RuleEngine.evaluate_invoice
                    9. NO llama DuplicateDetector.check_metadata
    ▼
[Angular] document-detail
    • muestra texto IA / confidence débil
    • matching posterior sin campos → SIN MATCH / trabajo manual
```

**Datos enviados al LLM:** OCR crudo o imagen + prompt libre.  
**Datos NO enviados:** schema JSON de factura, histórico Autobits, NIT maestros.

### 2.2 Path B — Pantalla Procesar (legacy)

```text
[Angular] ProcessingComponent
    ▼
POST /api/v1/contabilidad/api/procesar  (interceptor reescribe)
    ▼
procesador_interactivo → process_interactive (igual Path A)
    ▼
UI muestra ResultadoFactura.respuesta_ia (string)
```

### 2.3 Path C — Batch estructurado (CLI / API interna)

```text
main.py / process_invoice_batch(ruta)
    │
    ├─ preprocess + OCR
    ├─ OCR débil → extract_invoice_from_image (JSON) | revisión
    ├─ OCR OK → extract_invoice(ocr_text)  ← JSON SCHEMA
    ├─ RuleEngine.evaluate_invoice → validador.validar_factura
    ├─ score_invoice_extraction(extracted_dict)
    ├─ DuplicateDetector.check_metadata(numero, total)  [nit ignorado]
    └─ persist columnas + extracted_json + estado
```

Este es el path **correcto arquitectónicamente**, pero **no es el que dispara el upload de la UI**.

### 2.4 Path D — Autobits Excel

```text
[Angular] Autobits upload
    ▼
AutobitsService.preview_upload / import
    ▼
ExcelAutobitsAdapter → sample headers + filas
    ▼
ExcelAIAnalyzer.analyze (Gemini|Ollama JSON mapping)
    │  fallback suggest_mapping() heurístico
    ▼
Import AutobitsRecordModel
    ▼
CrossingService.seed_from_autobits / run_matching
    ▼
MatchingEngine.score_pair(Document ↔ Autobits)
    │  reasons + score → EXACTO / PROBABLE / SIN
    ▼
RuleEngine.evaluate_crossing → remediaciones
    ▼
UI Cruce: aprobar / subsanar / completar
```

### 2.5 Path E — Matching documento ↔ Autobits (detalle de datos)

```text
DocumentModel
  numero_documento, total, fecha_emision, provider.nit/nombre
  extracted_json.compra / .reserva
        │
        ▼
DocumentMatchContext
        │
        ▼
Comparar contra AutobitsRecordModel
  • compra/doc ±35–40
  • NIT 25
  • nombre similar 15
  • reserva 10
  • valor exact/near 15/8
  • fecha 5
        │
        ▼
MatchCandidate { score, match_type, reasons[] }
```

### 2.6 Transformaciones de datos contables

| Etapa | Input | Output |
|-------|-------|--------|
| Upload | bytes + filename | DocumentModel + storage_path + hash |
| Preprocess | imagen | imagen OpenCV |
| OCR | imagen | string + char count |
| AI batch | OCR string | dict factura plano |
| AI interactivo | OCR + solicitud | string `respuesta_ia` |
| Confidence | dict o prose wrapper | floats presencia |
| Validator | dict | flags revisar |
| Matching | Document + Autobits rows | Crossing + remediaciones |

---

## 3. Flujo IA COTIZADOR / COMERCIAL

### 3.1 Path Ave (copiloto global)

```text
[Angular] AveCopilotComponent
    │  mensaje + sessionId
    ▼
POST /api/v1/ai/copilot
    ▼
IntelligenceService.copilot → CopilotOrchestrator.chat
    │
    ├─ ConversationMemoryPort.load (últimos ~16 turns)
    ├─ CommercialCatalogService.buildPromptIndex + retrieveSnippets
    │     fuente: classpath ai/catalogo/productos.json (+ proveedores/meta)
    ├─ GenerativeAiPort.chat (GeminiAdapter)
    │     system: personalidad Ave + “no inventes precios” + índice catálogo
    │     user: mensaje + historial
    ├─ Parse opcional JSON { mode: QUOTE | PROVIDERS }
    ├─ si QUOTE → CatalogQuoteService.quote(message)
    │     HeuristicQuoteInterpreter + priceScaleByPax determinístico
    └─ persist memoria (si sesión no efímera)
    ▼
UI: markdown + AveQuoteReview (edición + PDF local)
    ⚠ No crea QuoteEntity en CRM
```

**Qué llega al LLM:** texto de conversación + índice/snippets de catálogo (no Sheets).  
**Qué NO llega:** disponibilidad live, descuentos B2B Sheets, matriz completa de seguimientos.

### 3.2 Path Consola IA / QuotationOrchestrator

```text
[Angular] /app/ai → EnterpriseAiService.quotation(message)
    ▼
POST /api/v1/ai/quotation
    ▼
QuotationOrchestrator.orchestrate
    1. interpretWithFallback
         Gemini.interpretQuote → QuoteInterpretation JSON
         catch → HeuristicQuoteInterpreter
    2. softRules(RuleEnginePort) → flags (jeep privado, etc.)
    3. applyRuleFlagsToInterpretation
    4. priceInterpretation
         TourPricingPort.findBestMatch
           CatalogAwareTourPricingAdapter (JSON first, JPA fallback)
         total = unit × people (+ ajustes reglas)
    5. ChecklistPort + RecommendationPort
    6. generateQuotationNarrative (opcional Gemini)
    7. AiObservabilityPort.record(latency, tokens est.)
    ▼
QuotationResponse estructurado → UI Consola
```

### 3.3 Path Inbox CRM (quote suggestion / generate)

```text
[Angular] ConversationDetail → AiQuoteDialog
    ▼
GET/POST /api/v1/ai/conversations/{id}/quote-suggestion | /quote
    ▼
AiQuoteService → ChatQuoteAnalyzerPort
    HeuristicChatQuoteAnalyzer
      • lee MessageEntity (pueden venir de Sheets sync)
      • regex personas / fechas / keywords tours
      • precios de mapa EXPERIENCES hardcodeado (COP)
      • ClaudeAiPort.enrich → siempre DISABLED
    ▼
suggestion { lines, total, confidence, analyzer }
    ▼
si generate → CommercialService.createQuote → QuoteEntity + PDF
```

**Desalineación:** este path **no** pasa por `QuotationOrchestrator` ni `ai/catalogo/`.

### 3.4 Path Actions

```text
POST /api/v1/ai/actions/execute
    ▼
ActionOrchestrator
    GeminiActionPlanInterpreter → plan JSON { tool, args }
    ▼
AiActionTool.execute
    • mutantes requieren confirm=true
    • GENERATE_QUOTE_FROM_CONVERSATION → path heurístico CRM
    • QUOTE_NATURAL_LANGUAGE → QuotationOrchestrator
    ▼
narrativa GenerativeAiPort.chat
```

### 3.5 Path assist (reply / summary / sentiment)

```text
AiController → AiAssistService → HeuristicChatAssistAdapter
  (+ Claude stub)
Paralelo Consola WhatsApp: WhatsAppAiAssistAdapter → Gemini
```

### 3.6 Google Sheets → datos comerciales (no precios)

```text
Apps Script doGet (JSON hojas)
    ▼
GOOGLE_SHEETS_WEBAPP_URL
    ▼
GoogleSheetsAdapter → SheetsPayloadMapper
    ├─► Dashboard Sheets UI (KPIs, seguimientos, ventas editables)
    └─► SheetsSyncService
          upsert Client / Conversation / Message
          (solicitud → inbound, respuesta → outbound)
                │
                └─► disponible para HeuristicChat* y Ave solo si el usuario
                    trabaja esa conversación (no bulk al prompt)
```

Escritura inversa: dashboard editor → `SheetsWriteService` → Apps Script `doPost` `updateRow`.

---

## 4. Flujo de configuración de providers

### SIG

```text
APP_AI_PROVIDER (default gemini)
    ▼
DefaultAiProviderFactory.getActiveProvider()
    ├─ gemini → GeminiAdapter (real)
    ├─ claude|openai|deepseek → DisabledAiProviderStub
    └─ unknown → BadRequest
```

### Contabilidad

```text
AI_PROVIDER | APP_AI_PROVIDER
    ▼
ai_factory.create_ai_provider()
    ├─ gemini + key → GeminiProvider
    ├─ gemini sin key → OllamaProvider (fallback silencioso)
    ├─ ollama → OllamaProvider
    └─ auto → Gemini si key else Ollama
```

---

## 5. Matriz “dato → consumidor IA”

| Dato | Origen | ¿Entra a LLM? | Cómo |
|------|--------|---------------|------|
| Imagen factura | Upload | Sí | OCR texto o vision |
| OCR text | Tesseract | Sí | Prompt extract |
| Excel Autobits headers/sample | Upload | Sí | Mapping columns |
| Autobits rows DB | SQLite | No al LLM | Matching determinístico |
| productos.json | Classpath | Sí | System prompt Ave / interpret |
| Seguimiento Sheets | Webapp | No directo | Sync CRM |
| Mensajes CRM | PG | Sí (assist/quote) | Turns texto |
| Reglas negocio PG | PG | No al LLM | RuleEngine Java |
| Usage logs | PG | No | Observabilidad |

---

## 6. Puntos de falla observables en el flujo

| Punto | Síntoma típico |
|-------|----------------|
| Upload Contabilidad + extract_custom | Documento EXTRAIDO sin totales/NIT |
| OCR &lt; 100 sin Gemini key | REQUIERE_REVISION / Ollama error |
| PDF upload | Fallo OCR / vacío |
| Matching sin campos | SIN MATCH pese a Autobits cargado |
| Ave sin GEMINI_API_KEY | Error o fallback heurístico con tour default |
| Inbox quote | Precio distinto a Consola/Ave |
| Context catálogo enorme | Latencia / truncado / costo |
| Procesamiento sync | Timeout Render/proxy; progress falso |

---

## 7. Diagrama resumen Contabilidad (as-is)

```text
Upload UI ──► process_interactive ──► extract_custom ──► prosa
                                                      ╲
CLI/batch ──► extract_invoice JSON ──► RuleEngine ──► columnas DB
                                                      │
Autobits Excel ──► AI map columns ──► records ──► MatchingEngine
                                                      │
                                                      ▼
                                                 Cruce UI
```

## 8. Diagrama resumen Cotizador (as-is)

```text
Ave/Consola ──► Gemini interpret ──► Catalog JSON prices ──► DTO/PDF local
Inbox ────────► Heurística + $-hardcode ──────────────────► Quote CRM
Sheets ───────► CRM messages (contexto chat, no tarifas)
```

---

## Referencias de código

- Contabilidad: `document_processing_service.py`, `documents.py`, `matching_engine.py`, `gemini_provider.py`  
- Cotizador: `QuotationOrchestrator.java`, `CopilotOrchestrator.java`, `HeuristicChatQuoteAnalyzer.java`  
- Sheets: `SheetsSyncService.java`, `SheetsPayloadMapper.java`
