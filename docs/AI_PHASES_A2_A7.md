# AI phases A2–A7 — entregado

**Fecha:** 2026-09-02  
**Proveedor objetivo:** Anthropic Claude (Haiku FAST / Sonnet REASONING) con Gemini/Ollama como fallback.

| Fase | Entrega | Estado |
|------|---------|--------|
| A1 | Anthropic SIG + usage/cost | Hecho (`AI_PHASE_A1.md`) |
| A2 | Router + complexity + fences + JSON validator + top-K en interpret | Hecho |
| A3 | `ContextRetriever` + `SessionSlotState` + Ave cableado | Hecho |
| A4 | Contabilidad Anthropic Haiku/Sonnet + env | Hecho |
| A5 | Frontend uso IA: modelo, tier, in/out, USD | Hecho |
| A6 | `AI_BENCHMARK.md` (plantilla + cómo medir) | Hecho |
| A7 | Cache tarifas 5 min + `async_mode` process documentos | Hecho |

## Piezas nuevas (SIG)

- `AiModelRouter` + `ComplexityScore`
- `PromptAssembly` (data fence)
- `StructuredOutputValidator` (+ retry 1× en interpretQuote)
- `ContextRetriever`, `SessionSlotState`, `SessionSlotStore`
- Ave: sin dump de 90 tours; missing-slot gate; fence en user payload
- `CatalogQuoteService` cache TTL 5 min

## Contabilidad

- `anthropic_client.py` / `anthropic_provider.py`
- `AI_PROVIDER=anthropic|claude`
- Escalado Haiku → Sonnet si `requiere_revision` o inconsistencia subtotal+IVA≈total
- `POST .../process` con `async_mode=true` o `PROCESS_ASYNC_DEFAULT`

## Activación Render

```env
APP_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL_FAST=claude-haiku-4-5-20251001
AI_MODEL_REASONING=claude-sonnet-4-5-20250929
# Contabilidad (mismo key o separado)
AI_PROVIDER=anthropic
```

Gemini puede quedar para vision residual / emergencia.
