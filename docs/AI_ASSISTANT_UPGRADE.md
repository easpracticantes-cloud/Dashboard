# Mejora integral del asistente Ave (2026-09)

## Objetivo

Asistente conversacional de **texto libre** (no FAQ cerrado), con Claude como proveedor principal recomendado, contexto/historial, cotizaciones solo vía PricingEngine, UX moderna y streaming progresivo.

## Flujo

```text
Usuario (mensaje libre)
  → POST /api/v1/ai/copilot[/stream]
  → CopilotOrchestrator
       → memoria (últimos 12) + slots + ContextRetriever top-K
       → fence anti-injection
       → GenerativeAiPort (Claude/Gemini)
       → opcional QUOTE/PROVIDERS → catálogo real
  → respuesta markdown (+ SSE deltas)
```

## Seguridad

- API keys solo en backend / `.env`
- Data fence en historial/mensaje
- Filtro de fugas de secretos en la respuesta
- Cotizaciones nunca inventadas (CatalogQuoteService)
- Endpoints `/ai/**` autenticados (JWT)
- Tools de acciones mutantes siguen en `/ai/actions/execute` con `confirm`

## Streaming

`POST /ai/copilot/stream` (SSE): revelado progresivo del texto completo (estable con cualquier proveedor). Fallback a `/ai/copilot` si el stream falla.

## Pendientes conscientes

- Streaming token-a-token nativo Anthropic (Messages `stream:true`) no cableado aún; la UX ya es progresiva.
- Ave no invoca aún el catálogo completo de ActionTools (FIND_OR_CREATE_CLIENT, etc.); sigue el path QUOTE/PROVIDERS + `/actions/execute` separado.
- Resumen automático de historial largo (ahora truncado a 12×600 chars).
