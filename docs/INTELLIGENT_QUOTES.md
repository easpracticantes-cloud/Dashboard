# Cotizaciones inteligentes (SIG)

## Separación obligatoria

| Módulo | Usa WhatsApp |
|--------|--------------|
| Registro / CRM | Sí (importación / captura) |
| **Cotizaciones** | **No** |

La cotización se construye con: **cliente SIG + instrucción del asesor + Claude + catálogo + plantilla**.

## Flujo

```
Asesor elige cliente (opcional) + escribe instrucción
        ↓
InstructionQuoteExtractor (Claude JSON estructurado)
        ↓
CatalogQuoteService (precios reales ai/catalogo/)
        ↓
QuoteDocumentCalculator (BigDecimal / IVA)
        ↓
Snapshot sig.intelligent_quotes
        ↓
Preview eas-quote-sheet (plantilla protegida)
        ↓
Edición humana + recalculate
        ↓
PDF multipágina (quote-pdf.ts) + approve → sig.quotes
```

## Roles

- **Claude:** interpretar, redactar, detectar faltantes. Nunca precios ni consecutivos.
- **SIG catálogo:** tarifas.
- **Backend:** cálculos, número `COT-…`, persistencia.
- **HTML/CSS `quote-sheet`:** identidad visual EAS (no rediseñar).
- **Frontend estudio:** `/app/quotes/nueva`.

## API

- `POST /api/v1/ai/intelligent-quotes`
- `GET /api/v1/ai/intelligent-quotes/{id}`
- `POST /api/v1/ai/intelligent-quotes/{id}/recalculate`
- `POST /api/v1/ai/intelligent-quotes/{id}/approve`
- Reutiliza `POST /api/v1/ai/quotes/document` para validación Ave.

## Checklist PDF

- [ ] Logo y colores EAS
- [ ] Datos empresa fijos
- [ ] Precios de catálogo
- [ ] Totales backend
- [ ] Sin placeholders `{{…}}`
- [ ] Multipágina con mismo header/footer
- [ ] Campos cliente vacíos ocultos en PDF
