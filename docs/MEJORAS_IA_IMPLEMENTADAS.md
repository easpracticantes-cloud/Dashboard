# Mejoras de IA implementadas (Fases 1 + P0)

**Fecha:** 2026-09-02  
**Alcance:** Fundación + P0 Contabilidad + P0 Cotizador Inbox  
**Referencias:** `docs/AUDITORIA_IA_COMPLETA.md`, `docs/PROBLEMAS_IA.md`, `docs/ARQUITECTURA_IA_PROPUESTA.md`

---

## Qué estaba mal

1. **Upload Contabilidad** llamaba `process_interactive` → `extract_custom` (prosa). No llenaba NIT/total/fecha → matching vacío.
2. **Confidence** era cosmética (presente=95 / ausente=0) sin fuente.
3. **Duplicados** ignoraban NIT.
4. **Validación** no chequeaba `subtotal + IVA ≈ total`.
5. **Inbox CRM** cotizaba con precios hardcodeados distintos a Ave/Consola (`ai/catalogo/`).
6. **Gemini sin key** caía a Ollama en silencio aunque `AI_PROVIDER=gemini`.

---

## Qué se cambió y por qué

### Contabilidad

| Cambio | Por qué |
|--------|---------|
| `process_by_id` → `process_structured_by_id` (`extract_invoice` JSON + RuleEngine + duplicados) | Path de producto debe alimentar matching y columnas |
| Schema compartido `invoice_schema.py` con `compra`, `reserva`, tipos doc, retención, vencimiento | Matching y RF lo necesitaban |
| `confidence_scorer` con `fields_detail {valor, confianza, fuente}` + consistencia matemática | Revisión humana informada |
| `validador.py` matemática determinística | LLM no es autoridad de totales |
| `DuplicateDetector` usa NIT (+ fecha) | Menos falsos positivos/negativos |
| `AI_PROVIDER=gemini` sin key **no** cae a Ollama (solo `auto`) | Errores honestos en Render |
| UI detalle: quita prompt libre; muestra fuente por campo; reproceso estructurado | UX alineada al pipeline real |

### Cotizador

| Cambio | Por qué |
|--------|---------|
| `HeuristicChatQuoteAnalyzer` usa `CatalogQuoteService` | Un PricingEngine / misma SoT que Ave |
| Analyzer `CATALOGO` vs `HEURISTICA_SIN_CATALOGO` | Transparencia; sin inventar tarifas |
| Eliminada tabla EXPERIENCES hardcodeada | Fin de montos inconsistentes |

---

## Archivos tocados

### Contabilidad
- `contabilidad-service/src/application/services/document_processing_service.py`
- `contabilidad-service/src/application/services/document_service.py`
- `contabilidad-service/src/api/routers/documents.py`
- `contabilidad-service/src/infrastructure/ai/invoice_schema.py` *(nuevo)*
- `contabilidad-service/src/infrastructure/ai/gemini_provider.py`
- `contabilidad-service/src/infrastructure/ai/ai_factory.py`
- `contabilidad-service/src/ia_ollama.py`
- `contabilidad-service/src/domain/services/confidence_scorer.py`
- `contabilidad-service/src/domain/services/duplicate_detector.py`
- `contabilidad-service/src/validador.py`
- `contabilidad-service/tests/test_confidence.py`
- `contabilidad-service/tests/test_duplicate_metadata.py`

### Frontend Contabilidad
- `frontend/.../documents/document-detail.component.ts|html`
- `frontend/.../services/documents-api.service.ts`

### Cotizador SIG
- `backend/.../HeuristicChatQuoteAnalyzer.java`

### Docs Fase 0 (previos)
- `docs/AUDITORIA_IA_COMPLETA.md`
- `docs/FLUJO_IA_ACTUAL.md`
- `docs/PROBLEMAS_IA.md`
- `docs/ARQUITECTURA_IA_PROPUESTA.md`

---

## Funcionalidades nuevas

- Extracción estructurada automática al subir documento.
- Confidence con **fuente** (`OCR+IA`, `VISION+IA`, `+REGLA`).
- Detección de inconsistencia matemática → `REQUIERE_REVISION`.
- Cotización Inbox anclada a `ai/catalogo/`.
- Provider Contabilidad más honesto en configuración.

---

## Pruebas realizadas

- `pytest tests/test_confidence.py` → **4 passed** (confianza, math mismatch, validador).
- `test_duplicate_metadata.py` requiere deps del venv Contabilidad (sqlalchemy/pydantic); lógica cubierta en código.
- Compilación Maven local no disponible en este entorno (`mvn` ausente); cambio Java acotado a un `@Component` con DI estándar.

**Verificación manual recomendada en Render/local:**

1. Subir factura JPG en Contabilidad → ver NIT/total/JSON en detalle.  
2. Reprocesar documento → estado PROCESADO o REQUIERE_REVISION coherente.  
3. Inbox → “Cotizar con IA” con “tour café 4 personas” → analyzer `CATALOGO` y total del JSON.  
4. Sin `GEMINI_API_KEY` y `AI_PROVIDER=gemini` → mensaje claro (no Ollama silencioso).

---

## Limitaciones que siguen

- PDF multipágina / rasterización aún no implementados.
- Progress async real aún no (sigue sync HTTP).
- Ave aún no persiste Quote CRM automáticamente.
- Intent/slot-filling multi-turn formal (Fase 3 completa) pendiente.
- RAG/pgvector no activado (no necesario aún).
- Claude/Anthropic: **A1 listo** en SIG Java (`docs/AI_PHASE_A1.md`); Contabilidad Claude = fase A4.
- Pantalla `/procesamiento` legacy (`/api/procesar`) sigue en modo interactivo libre (Q&A); el path Documentos es el canónico.

---

## Preparado para siguientes fases

- Fase 3: IntentDetector + SessionSlotState + retrieval top-K (sin dump catálogo).
- Fase 2 restante: PDF OCR, async jobs.
- Fase 5: UI editable campo a campo con aceptar/corregir.
- Fase 4: facades AccountingAi / QuotationAi homogéneos.

---

## Criterio de no-regresión

- No se eliminó MatchingEngine ni QuotationOrchestrator.
- Catálogo JSON sigue siendo SoT de precios.
- Contabilidad sigue en FastAPI; cotizador en Spring.
