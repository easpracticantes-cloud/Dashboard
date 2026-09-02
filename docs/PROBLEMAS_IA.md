# Problemas de IA identificados — priorizados

**Fase 0** · 2026-09-02  
Criterio: impacto en precisión × frecuencia × riesgo de negocio.  
No incluye fixes implementados (Fase 0 = diagnóstico).

---

## Leyenda

| Severidad | Significado |
|-----------|-------------|
| **P0** | Rompe el valor del producto en el path real de usuario |
| **P1** | Error estructural / inconsistencia grave |
| **P2** | Deuda técnica que limita escala o calidad |
| **P3** | Mejora / higiene |

| Tipo | |
|------|--|
| BUG | Comportamiento incorrecto vs intención del código/docs |
| ARCH | Diseño fragmentado |
| DATA | Ingesta / contexto mal construido |
| PROMPT | Lógica de negocio atrapada en prompts |
| UX | Usuario no entiende qué hizo la IA |
| SEC | Seguridad |
| PERF | Latencia / tokens / costos |
| TEST | Cobertura insuficiente |

---

## P0 — Críticos

### P0-1 · Upload Contabilidad usa extracción libre, no factura estructurada
- **Tipo:** BUG / ARCH  
- **Dónde:** `documents.upload` → `process_by_id` → `process_interactive` → `extract_custom`  
- **Efecto:** columnas NIT/total/fecha vacías; matching muerto; confidence engañosa; viola RF “IA no decide / schema estructurado”.  
- **Evidencia:** solicitud pide campos, pero el provider responde prosa; batch path correcto no se usa.  
- **Fix dirigido (Fase 2):** cablear upload a `process_invoice_batch` / `extract_invoice` (+ vision invoice).

### P0-2 · Tres motores de precio comerciales
- **Tipo:** ARCH / DATA  
- **Dónde:** `CatalogQuoteService` vs `QuotationOrchestrator` vs `HeuristicChatQuoteAnalyzer.EXPERIENCES`  
- **Efecto:** misma solicitud → montos distintos según Ave / Consola / Inbox; riesgo comercial y legal.  
- **Fix dirigido (Fase 3):** Inbox debe llamar catálogo / orchestrator; eliminar hardcodes o convertirlos en alias del catálogo.

### P0-3 · `compra` / `reserva` no están en el schema de extracción
- **Tipo:** DATA / BUG  
- **Dónde:** prompts invoice; `MatchingEngine` depende de esos campos  
- **Efecto:** peso alto de matching nunca se alimenta desde OCR.  
- **Fix:** ampliar schema + normalización + UI revisión.

---

## P1 — Graves

### P1-1 · Confidence no es confidence
- **Tipo:** ARCH  
- **Dónde:** `confidence_scorer.py` (95 si hay valor, 0 si no)  
- **Efecto:** UI muestra % que no refleja incertidumbre del modelo/OCR.  
- **Fix:** `{valor, confianza, fuente}` + señales OCR/consistencia matemática.

### P1-2 · Duplicados ignoran NIT (y fecha/proveedor)
- **Tipo:** BUG  
- **Dónde:** `DuplicateDetector.check_metadata(nit, ...)` — `nit` no filtra  
- **Efecto:** falsos positivos/negativos.  

### P1-3 · PDF aceptado sin OCR PDF
- **Tipo:** BUG  
- **Dónde:** allowlist vs PIL/cv2  
- **Efecto:** documentos “subidos” inutilizables.

### P1-4 · Path interactivo salta RuleEngine de factura
- **Tipo:** ARCH  
- **Dónde:** `process_interactive`  
- **Efecto:** estados EXTRAIDO sin validación determinística.

### P1-5 · Ave no persiste Quote CRM
- **Tipo:** UX / ARCH  
- **Dónde:** Ave PDF local  
- **Efecto:** trail comercial incompleto; Inbox y Ave divergen operativamente.

### P1-6 · Catálogo inyectado casi completo al prompt
- **Tipo:** DATA / PERF / PROMPT  
- **Dónde:** `CommercialCatalogService.buildPromptIndex` + Ave SYSTEM  
- **Efecto:** tokens altos, truncado, riesgo de alucinación si falla mode QUOTE.  
- **Fix:** retrieval semántico / top-K snippets + pricing fuera del LLM.

### P1-7 · Fallback Gemini→Ollama silencioso (Contabilidad)
- **Tipo:** ARCH  
- **Dónde:** `ai_factory.py`  
- **Efecto:** en Render “parece Gemini” pero falla Ollama.

### P1-8 · Inbox “IA” es heurística disfrazada
- **Tipo:** UX / ARCH  
- **Dónde:** `HeuristicChatQuoteAnalyzer` + Claude stub siempre DISABLED  
- **Efecto:** expectativa de Gemini; precios inventados por tabla fija.

---

## P2 — Estructurales / calidad

### P2-1 · Sin pipeline formal Intent → Entities → Missing → Retrieve → Price → Reply
- Cotizador depende de one-shot interpret + prompt Ave.  
- Falta detección estructurada de faltantes (“fecha faltante”) sin inventar.

### P2-2 · Memoria sin slot state
- Ave guarda turns; no hay objeto canónico `{personas, fecha, idioma, servicios[]}`.

### P2-3 · Lógica jeep/guías en prompt
- Debe vivir en RuleEngine / PricingEngine (parcialmente ya hay reglas PG/meta).

### P2-4 · Sin validación `subtotal + IVA ≈ total`
- Cálculos críticos no deben confiar en LLM.

### P2-5 · Sin clasificador robusto de tipo documental
- Factura vs cuenta de cobro vs recibo vs desconocido: schema asume `"factura"`.

### P2-6 · OCR débil para Colombia
- Keywords EN; sin deskew; sin tablas; sin multipágina.

### P2-7 · Procesamiento síncrono + progress falso
- Timeouts; mala UX; job model sin cola real.

### P2-8 · Prompts duplicados Gemini/Ollama
- Drift inevitable.

### P2-9 · Sheets no estructurado para IA comercial
- Bueno que no se mande crudo; falta capa semántica si se quiere parametrización B2B desde Sheets.

### P2-10 · RAG/pgvector stub
- No aporta hoy; no instalar moda hasta que retrieval por catálogo lo justifique.

### P2-11 · Observabilidad Contabilidad incompleta
- Sin usage log unificado (latencia, modelo, tokens, confianza).

### P2-12 · Docs internos desactualizados
- `ARQUITECTURA_CONTABLE_IA.md` aún describe escenarios viejos (Ollama-only / sin tests).

### P2-13 · SQLite efímero en Render free
- Pérdida de histórico contable tras redeploy.

### P2-14 · Action tools: riesgo de UUIDs alucinados
- Mitigado por confirm; falta validación dura de args.

### P2-15 · Transporte/restaurant a 0 en CatalogAware
- Comentarios vs realidad; fácil malentender totales.

---

## P3 — Higiene / menor impacto inmediato

- Stubs Claude/OpenAI/DeepSeek generan ruido en UI “providers”.  
- Dual `ClaudeAiPort` vs `ClaudeAdapterStub`.  
- Keywords OCR en inglés.  
- Temperatura/tokens Ollama no tipados.  
- Contabilidad CORS `*` frecuente.  
- Gemini API key en query string (limitación API; documentar rotación).  
- Ave tool protocol soft (regex JSON).  
- Default heurístico tour ACAIME / 2 pax.  
- Falta suite de fixtures reales (facturas CO + diálogos cotización).

---

## Problemas de seguridad (detalle)

| ID | Riesgo | Mitigación actual | Gap |
|----|--------|-------------------|-----|
| SEC-1 | Prompt injection vía OCR/chat/Excel | Poca sanitización | Escapar roles; no obedecer “ignora reglas” en documentos |
| SEC-2 | systemPrompt custom en chat SIG | Confía en rol autenticado | Restringir a admin; plantillas fijas |
| SEC-3 | Actions mutantes | `confirm=true` | Validar IDs existen; dry-run default UI |
| SEC-4 | Uploads maliciosos | Extensión + size | Antivirus/magic bytes; no ejecutar contenido |
| SEC-5 | PII en logs | Truncate errores SIG | Redactar NIT/celular en prompts logs |

---

## Problemas de experiencia de usuario

| ID | Problema | Impacto |
|----|----------|---------|
| UX-1 | Contabilidad: no se ve qué campos extrajo con certeza | Revisión humana ciega |
| UX-2 | Procesar: solo prosa | No editable campo a campo |
| UX-3 | Progress falso | Timeout sin explicación |
| UX-4 | Ave vs Inbox precios distintos | Pérdida de confianza interna |
| UX-5 | Ave no deja rastro CRM | Comercial no cierra ciclo |
| UX-6 | Errores técnicos (Ollama/402/403) a veces leak | Mala percepción |

---

## Mapa problema → fase sugerida

| ID | Fase |
|----|------|
| P0-1, P1-2, P1-3, P1-4, P1-1, P0-3 | Fase 2 Contable |
| P0-2, P1-5, P1-6, P1-8, P2-1, P2-2, P2-3 | Fase 3 Cotizador |
| Schemas, providers, errores, obs | Fase 1 Fundación |
| Orchestrator unificado | Fase 4 |
| UI confidence / quote review | Fase 5 |
| Suites casos reales | Fase 6 |
| Tokens / async / retrieval | Fase 7 |

---

## Anti-patrones detectados (checklist)

- [x] Texto → LLM → texto en path contable UI  
- [x] LLM como fuente de precio en Inbox (tabla hardcode ≈ inventar)  
- [x] Lógica de negocio en prompt (jeep)  
- [x] Dump de dataset al contexto  
- [x] Confidence cosmética  
- [x] Validación saltada en path feliz  
- [x] Integraciones presentadas como AI vivas (Claude) cuando están DISABLED  
- [x] Dos inteligencias mezcladas solo a nivel de expectativa de usuario, no de código (bien separado código; mal comunicado producto)

---

## Qué NO es un problema (evitar rewrite inútil)

- Separar Contabilidad FastAPI de SIG Spring.  
- Tener `QuotationOrchestrator` con pricing Java.  
- Catálogo JSON versionado como SoT de tarifas (mientras no haya API de tarifas).  
- Matching determinístico Autobits.  
- Stubs Claude/OpenAI listos para futuro (si la UI no miente).  
- Sheets como CRM/dashboard (correcto); el error sería usarlo crudo como tarifas sin capa semántica.

---

## Criterio de “listo” para cerrar cada problema

Un problema P0/P1 se considera resuelto solo si:

1. Hay test automatizado del caso.  
2. El path de UI real lo ejercita.  
3. Se comparó resultado vs baseline (precio / campos extraídos).  
4. La UI muestra estado comprensible (confianza / revisión).  
5. No se introdujo un tercer path paralelo sin deprecar el viejo.
