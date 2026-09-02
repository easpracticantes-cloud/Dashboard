# AI Benchmark — plantilla de medición

**Objetivo:** comparar baseline (Gemini + dump catálogo) vs Claude Haiku/Sonnet + top-K + No-AI pricing.  
**No afirmar ahorro $ sin rellenar esta tabla con corridas reales.**

## Fixtures sugeridos

| ID | Dominio | Input |
|----|---------|-------|
| Q1 | Cotización | "Cotiza Acaime privado 5 personas sábado con almuerzo" |
| Q2 | Cotización compleja | B2B + inglés + 2 tours + jeep |
| C1 | Contabilidad | Factura OCR clara (NIT+total) |
| C2 | Contabilidad | OCR débil / total inconsistente |
| A1 | Ave | Chat multi-turn slots incompletos |

## Métricas por fixture

| Métrica | Baseline | Después | Δ |
|---------|----------|---------|---|
| Llamadas LLM | | | |
| Input tokens | | | |
| Output tokens | | | |
| Latency p50 (ms) | | | |
| Latency p95 (ms) | | | |
| estimatedCostUsd | | | |
| Precio exacto = PricingEngine | | | |
| % requires_human_review | | | |
| Campos factura vs golden | | | |

## Cómo medir (SIG)

1. Activar `APP_AI_PROVIDER=anthropic` (o gemini baseline).
2. Ejecutar fixtures vía `/api/v1/ai/quotation`, `/ai/copilot`, Contabilidad `/api/documents/{id}/process`.
3. Leer `GET /api/v1/ai/usage-logs` (UI pestaña **Uso IA**): modelo, tier, in/out, USD.
4. Anotar resultados en esta tabla y commitear una corrida fechada.

## Criterio de éxito (plan)

- ↓ 40–65% estimado $ vs “todo Sonnet + dump catálogo”
- Precisión de precio **sin regresiones** (siempre PricingEngine / `ai/catalogo`)
- Contabilidad: matching no empeora vs P0 structured extract
