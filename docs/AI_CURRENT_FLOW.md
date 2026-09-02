# AI Current Flow — as-is

**Fecha:** 2026-09-02 · Sin implementación

---

## 1. Diagrama global

```text
Usuario (Angular)
 ├─ Contabilidad UI ──JWT──► Spring BFF ──► FastAPI Contabilidad
 │                              │              ├─ OCR Tesseract
 │                              │              ├─ Gemini/Ollama extract_invoice
 │                              │              ├─ RuleEngine + Matching
 │                              │              └─ SQLite
 │
 ├─ Ave / Consola IA ──JWT──► GenerativeAiController
 │                              ├─ CopilotOrchestrator / QuotationOrchestrator
 │                              ├─ GeminiAdapter (único vivo)
 │                              ├─ Catalog JSON prices
 │                              └─ AiUsageLog (parcial)
 │
 └─ Inbox CRM ──JWT──► AiController
                        ├─ CatalogQuoteService (precio)
                        ├─ Heuristic assist (texto)
                        └─ Claude stub (nunca CONNECTED)

Sheets Apps Script ──► GoogleSheetsAdapter ──► Dashboard + CRM Messages
                         (no tarifas LLM)
```

---

## 2. Flujo Contabilidad (Documentos — canónico post-P0)

```text
Upload archivo
 → hash duplicate?
 → process_structured_by_id
 → preprocess OpenCV
 → OCR (original vs preprocesado)
 → chars < 100?
      SÍ → Gemini vision extract_invoice_from_image (si gemini)
      NO → extract_invoice(ocr_text) JSON
 → RuleEngine.evaluate_invoice (incl. matemática)
 → confidence_to_dict (valor/confianza/fuente)
 → DuplicateDetector (NIT+número+total/fecha)
 → persist columnas + extracted_json
 → UI detalle
```

**Legacy:** `/api/procesar` → `process_interactive` → `extract_custom` (texto libre). No es el path de producto.

---

## 3. Flujo Cotizador Ave

```text
Mensaje + sessionId
 → Memory (últimos ~16 turns texto)
 → buildPromptIndex(90) + snippets(6)   ← contexto grande
 → Gemini chat (system Ave + catálogo)
 → opcional JSON mode QUOTE|PROVIDERS
 → CatalogQuoteService.quote()          ← precio determinístico
 → UI review / PDF local (no CRM Quote)
```

---

## 4. Flujo QuotationOrchestrator (Consola)

```text
Mensaje
 → Gemini.interpretQuote (+ índice catálogo 120)
 → fallback HeuristicQuoteInterpreter
 → RuleEngine soft
 → TourPricingPort / CatalogAware
 → people × unit (Java)
 → Checklist + Recommendations
 → Gemini narrative opcional
 → QuotationResponse + usage log
```

---

## 5. Flujo Inbox quote

```text
Mensajes conversación
 → party size / fecha heurísticos
 → CatalogQuoteService.tryQuote(natural)
 → si match: analyzer=CATALOGO, total catálogo
 → si no: base-price provisional + revisión
 → createQuote CRM opcional
 → Claude enrich solo si stub CONNECTED (nunca)
```

---

## 6. Flujo Actions

```text
POST /ai/actions/execute
 → GeminiActionPlanInterpreter (JSON plan)
 → tool registry
 → mutantes requieren confirm=true
 → narrativa Gemini
```

---

## 7. Configuración as-is

| Stack | Provider env | Model env |
|-------|--------------|-----------|
| SIG | `APP_AI_PROVIDER` (gemini) | `GEMINI_MODEL` |
| Contabilidad | `AI_PROVIDER` / `APP_AI_PROVIDER` | `GEMINI_MODEL` / `OLLAMA_MODEL` |
| Anthropic | — | — |

Timeouts Gemini SIG: connect 15s / read 90s. Contabilidad Gemini timeout ~90s.

---

## 8. Observabilidad as-is

Tabla `sig.ai_usage_logs`: endpoint, operation, provider, model, latencyMs, estimatedTokens, success, error.  
**Frecuente:** `model` y `estimatedTokens` null; **sin** estimated cost USD; Contabilidad sin tabla equivalente.

---

## 9. Dónde el flujo viola el modelo objetivo

| Etapa objetivo | Hoy |
|----------------|-----|
| INTENT dedicado | Embebido en classify/interpret one-shot |
| STRUCTURED DATA slots | Solo en QuoteInterpretation puntual |
| CONTEXT RETRIEVAL mínimo | Dump índice catálogo |
| BUSINESS RULES | Parcial (bien en price; jeep aún en prompt Ave) |
| APPROPRIATE MODEL | Un solo Gemini flash para todo |
| STRUCTURED OUTPUT | Mixto (Ave texto libre) |
| VALIDATION | Contable sí; Ave soft |
| BUSINESS LOGIC precio | Bien en Java/catálogo |
| FINAL RESPONSE | A menudo LLM mezcla explicación + datos |
