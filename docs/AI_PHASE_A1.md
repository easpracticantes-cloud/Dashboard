# Fase A1 — Anthropic Provider + Usage/Cost (SIG Java)

**Fecha:** 2026-09-02  
**Estado:** implementado en backend SIG  
**Alcance:** Claude Haiku/Sonnet vía Messages API; Gemini permanece como fallback/default.

---

## Qué quedó listo

| Pieza | Ubicación |
|-------|-----------|
| `AnthropicAdapter` | `infrastructure/ai/adapters/anthropic/` |
| `AnthropicProperties` + RestClient | `infrastructure/ai/config/` |
| `AiModelRouter` (FAST/REASONING) | `application/ai/AiModelRouter.java` |
| `AiUsageService` (tokens + $ USD) | `application/ai/AiUsageService.java` |
| Prompts compartidos | `PromptingGenerativeAiAdapter` |
| Migración costo | `V17__ai_usage_cost_columns.sql` |
| Stub Claude eliminado | reemplazado por adapter real |

## Activación

```env
APP_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL_FAST=claude-haiku-4-5-20251001
AI_MODEL_REASONING=claude-sonnet-4-5-20250929
```

Aliases de provider: `anthropic` y `claude` → `AiProviderType.CLAUDE`.

Default sigue siendo `gemini` si no se cambia `APP_AI_PROVIDER`.

## Routing A1 (heurístico)

- **Haiku (FAST):** chat, classify, interpretQuote, summarize, suggestReply, narrative, extract…
- **Sonnet (REASONING):** `actions` / `actionsExecute` / `action_plan` / `review` / `conflict` / `complex_chat`

A2 añadirá complexity score real.

## Observabilidad

Cada llamada Anthropic persiste en `sig.ai_usage_logs`:

- `input_tokens`, `output_tokens`
- `estimated_cost_usd` (tarifas configurables `AI_PRICE_HAIKU_*` / `AI_PRICE_SONNET_*`)
- `model_tier` (`FAST` | `REASONING`)

Endpoint de uso reciente (`IntelligenceService.recentUsage`) ya expone estos campos.

## No-AI (sin cambios, obligatorio)

Precios / totales / SQL / RuleEngine / `CatalogQuoteService` **no** pasan por Claude.

## Siguiente (A2)

Router + schemas JSON estrictos, ContextRetriever top-K, SessionSlotState, StructuredOutputValidator.
