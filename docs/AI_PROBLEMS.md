# AI Problems — Claude reengineering lens

**Fecha:** 2026-09-02

Severidad: **P0** bloquea valor/costo · **P1** arquitectura · **P2** calidad · **P3** higiene

---

## P0 — Coste y calidad estructural

### P0-1 · Un solo modelo para todas las tareas
Gemini flash (o el que esté en env) hace clasificación, extracción, chat, narrativa y action plans.  
**Impacto:** se paga “razonamiento” implícito en tareas baratas; no hay Haiku/Sonnet split.  
**Fix:** AI Router + `AI_MODEL_FAST` / `AI_MODEL_REASONING`.

### P0-2 · Contexto catálogo demasiado grande
Ave/interpret inyectan hasta 90–120 productos con escalas de precio.  
**Impacto:** tokens ↑, latencia ↑, riesgo de que el LLM “mire” precios (aunque PricingEngine calcule).  
**Fix:** ContextRetriever top-K; precios solo en backend.

### P0-3 · Claude es stub; dualidad de ports
`GenerativeAiPort` stub + `ClaudeAiPort` stub separados.  
**Impacto:** UI/status puede sugerir Claude; cero capacidad real; confusión al “activar Claude”.  
**Fix:** un `AnthropicProvider` real en factory; deprecar enrich path duplicado.

### P0-4 · Sin métrica de costo
Usage log sin USD estimado ni tokens fiables.  
**Impacto:** imposible optimizar Haiku vs Sonnet con datos.  
**Fix:** `AIUsageService` con pricing table por modelo.

---

## P1 — Arquitectura / producto

### P1-1 · No hay Intent → Missing → Retrieve pipeline formal
Cotizador depende de one-shot interpret + prompt Ave.  
Slots multi-turn no son objeto de dominio.

### P1-2 · Ave no escribe Quote CRM
Trail comercial incompleto vs Inbox.

### P1-3 · Contabilidad y SIG: dos factories, dos configs
Duplicación Gemini; Claude habría que implementarlo dos veces sin contrato compartido de routing.

### P1-4 · Prompt injection
OCR, Sheets→mensajes y chat se meten al prompt sin cercas “DATA vs INSTRUCTIONS”.

### P1-5 · Legacy `/procesar` texto libre
Compite con path estructurado; confunde a usuarios internos.

### P1-6 · LLM usado donde no hace falta
`detectLanguage`, parte de sentiment, y cualquier “cálculo” que se cuele en prompt.

### P1-7 · Sin async para OCR+LLM
HTTP síncrono → timeouts Render; retries caros si el cliente repite.

---

## P2 — Calidad operativa

- PDF multipágina no rasterizado.  
- Confidence contable mejoró (P0) pero umbrales no calibrados con ground truth.  
- Action plans: riesgo de IDs alucinados (mitigado por confirm).  
- Observabilidad Contabilidad incompleta.  
- Docs Fase 0 antiguos parcialmente desactualizados respecto a P0.

---

## P3 — Higiene

- Stubs OpenAI/DeepSeek en UI providers.  
- Defaults de modelo distintos entre `.env.example` y `application.yml`.  
- Jeep/guías aún en system prompt Ave además de meta/rules.

---

## Problemas que YA NO son P0 (tras mejoras recientes)

| Antes | Ahora |
|-------|-------|
| Upload Contabilidad → extract_custom | `process_structured_by_id` + JSON |
| Inbox precios hardcode | `CatalogQuoteService` |
| Duplicados sin NIT | NIT en metadata check |
| Sin validación matemática factura | `validador` + confidence |

---

## Anti-patrones a eliminar en la reingeniería

1. “Cambiar Gemini por Claude” sin router.  
2. Sonnet para intent/clasificación.  
3. Enviar Sheets completas o catálogo completo.  
4. Pedir al LLM el total en COP.  
5. Historial textual interminable sin SessionSlotState.  
6. Keys en frontend / logs.  
7. Presentar stubs como conectados.
