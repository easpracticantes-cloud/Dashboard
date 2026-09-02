# AI Architecture Audit — Claude-first / cost-aware

**Fecha:** 2026-09-02  
**Modo:** Solo auditoría (sin cambios de código)  
**Objetivo:** Reingeniería hacia Anthropic Claude (Haiku + Sonnet) con máxima calidad y mínimo costo  
**Complementa:** `docs/AUDITORIA_IA_COMPLETA.md`, `docs/MEJORAS_IA_IMPLEMENTADAS.md` (P0 recientes)

---

## 1. Estado actual (post-P0)

| Dominio | Proveedor vivo | Arquitectura | Calidad de diseño |
|---------|----------------|--------------|-------------------|
| SIG cotizador / Ave / Consola | **Gemini** (`GeminiAdapter`) | Hexagonal + `QuotationOrchestrator` + catálogo JSON | Buena base (LLM interpreta, Java calcula) |
| SIG Inbox assist/quote | Gemini indirecto / heurística + **catálogo** para precio | `HeuristicChatQuoteAnalyzer` → `CatalogQuoteService` | Precio unificado (P0); narrativa aún débil |
| Contabilidad | **Gemini** o Ollama | FastAPI + OCR + `extract_invoice` estructurado (P0) | Path Documentos correcto; legacy `/procesar` libre |
| Claude / Anthropic | **Stub** (`ClaudeAdapterStub`, `ClaudeAiStubAdapter`) | Hook `AI_PROVIDER=claude` → DISABLED | **Cero llamadas reales a Anthropic** |
| OpenAI / DeepSeek | Stub | Mismo patrón | No productivo |

**Veredicto:** No basta “poner la key de Claude”. Hoy no hay SDK Anthropic, ni routing Haiku/Sonnet, ni control de costo por tarea, ni ContextRetriever mínimo. Gemini hace **casi todas** las tareas con el **mismo** modelo flash.

---

## 2. Mapa de llamadas LLM reales (hoy)

### Backend SIG → siempre el mismo Gemini

| Operación | Quién | ¿Debería ser LLM? | Modelo ideal futuro |
|-----------|-------|-------------------|---------------------|
| `interpretQuote` | QuotationOrchestrator | Sí (extracción) | **Haiku** |
| `generateQuotationNarrative` | Orchestrator | Sí (explicación) | Haiku (Sonnet solo si conflicto) |
| Ave `chat` | CopilotOrchestrator | Sí (conversación) | Haiku default; Sonnet si ambigüedad alta |
| `classifyConversation` / intent | IntelligenceService | Sí (clasificación) | **Haiku** |
| `analyzeSentiment` | IntelligenceService | Opcional | Haiku o **regla** |
| `suggestReply` | IntelligenceService | Sí | Haiku |
| `summarizeConversation` | IntelligenceService | Sí | Haiku |
| `extractReservationInformation` | IntelligenceService | Sí | Haiku |
| `detectLanguage` | IntelligenceService | Preferible **lib** (no LLM) | No AI |
| Action plan JSON | GeminiActionPlanInterpreter | Sí (plan) | Haiku; Sonnet si multi-tool complejo |
| Pricing / totales | CatalogQuoteService / Java | **No** | No AI |
| RuleEngine flags | Java | **No** | No AI |

### Contabilidad → Gemini/Ollama

| Operación | ¿LLM? | Ideal |
|-----------|-------|-------|
| `extract_invoice` JSON | Sí | **Haiku** (+ visión si API lo permite; si no Gemini vision fallback) |
| `extract_invoice_from_image` | Sí | Vision path; Haiku text tras OCR si texto suficiente |
| Excel column mapping | Sí | **Haiku** |
| `extract_custom` (legacy Procesar) | Reducir / deprecar | Haiku solo Q&A interno |
| Matching Autobits | **No** | Reglas (ya) |
| `subtotal+IVA≈total` | **No** | Reglas (ya P0) |
| Duplicados hash/NIT | **No** | Reglas (ya) |

---

## 3. Fuentes de datos vs lo que llega al LLM

| Fuente | Rol real | ¿Entra al LLM hoy? | Debe entrar |
|--------|----------|--------------------|-------------|
| `ai/catalogo/*.json` | SoT precios | **Sí, dump** índice 90–120 productos en Ave/interpret | Solo **top-K** cards |
| PostgreSQL CRM | Conversaciones, quotes | Mensajes completos en assist | Slots + últimos N turns |
| Google Sheets | Dashboard + sync CRM | No matrices crudas (bien) | Solo context cards B2B si aplica |
| OCR texto | Contabilidad | OCR completo al prompt | OCR + schema; truncar ruido |
| Autobits Excel | Matching | Sample columnas a IA mapping | Solo headers + 3–5 filas |
| Reglas PG / meta.json | Negocio | Parcialmente en prompts | Backend rules, no prompt |

---

## 4. Abstracciones existentes (mantener)

**SIG**
- `GenerativeAiPort` + `AiProviderFactory` + `AiProviderType` (ya mapea `claude|anthropic`)
- `QuotationOrchestrator` (interpret → rules → price → narrative)
- `CatalogQuoteService` / `CommercialCatalogService`
- `AiObservabilityPort` → `sig.ai_usage_logs`
- Action tools con `confirm=true`

**Contabilidad**
- `AIProvider` protocol + `ai_factory`
- `process_structured_by_id` + RuleEngine + MatchingEngine
- Confidence con `fields_detail` (P0)

**Claude stubs**
- Sustituir stub por implementación real; no inventar segundo port paralelo sin unificar `GenerativeAiPort` y `ClaudeAiPort`.

---

## 5. Huecos para Claude-first

1. **No existe** cliente HTTP Anthropic Messages API.  
2. **No existe** `AI_MODEL_FAST` / `AI_MODEL_REASONING`.  
3. **No existe** AI Router (complejidad → modelo / no-AI).  
4. **No existe** estimated cost en usage log.  
5. **No existe** ContextRetriever top-K (solo score keywords + dump índice).  
6. **No existe** SessionSlotState estructurado (solo turns texto).  
7. Contabilidad **no** comparte el mismo provider abstraction que SIG.  
8. Prompt injection: OCR/chat se concatenan sin delimitadores “DATA ONLY”.  
9. `detectLanguage` y parte de sentiment pueden salir del LLM.  
10. Ave inyecta escalas de precio al LLM (innecesario si PricingEngine es autoridad).

---

## 6. Render / secretos (diseño requerido)

Variables objetivo (aún **no** en código):

```text
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_MODEL_FAST=claude-haiku-4-5
AI_MODEL_REASONING=claude-sonnet-4-5
AI_TIMEOUT=60
AI_MAX_RETRIES=2
AI_MAX_TOKENS=4096
AI_COST_LOG_ENABLED=true
```

Compat: mantener `GEMINI_*` / `OLLAMA_*` como fallback opcionales.  
Frontend: **nunca** recibe keys.  
Contabilidad Render + SIG backend Render: mismas vars vía env.

---

## 7. Conclusión de auditoría

El proyecto **ya tiene** la forma correcta en cotización enterprise y en extracción contable estructurada. Lo que falta para la reingeniería pedida es:

1. Proveedor Anthropic real detrás de la factory.  
2. Router Haiku/Sonnet/No-AI.  
3. Context mínimo + slots.  
4. Cost observability.  
5. Unificar Contabilidad al mismo contrato de routing (o mirror Python).

**No** se recomienda un rewrite del monorepo ni mezclar Contabilidad FastAPI dentro de Spring solo por Claude.
