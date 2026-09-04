# Despliegue Contabilidad — histórico Render

> **Obsoleto para producción.** Usar Oracle: [`docs/ORACLE_DEPLOYMENT.md`](../docs/ORACLE_DEPLOYMENT.md).

Para que **Contabilidad** funcionara en la página pública en Render:

## Checklist rápido

1. **Crear Web Service** `sig-contabilidad` (Docker, carpeta `contabilidad-service`)
2. En el servicio Contabilidad → Environment:
   ```
   APP_HOST=0.0.0.0
   APP_OPEN_BROWSER=0
   DATABASE_URL=sqlite:////app/data/contable.db
   STORAGE_ROOT=/app/storage
   AI_PROVIDER=gemini
   GEMINI_API_KEY=<la misma key que usa el backend SIG>
   GEMINI_MODEL=gemini-2.0-flash
   ```
   (puedes usar el mismo `GEMINI_MODEL` que el backend, p. ej. `gemini-3.5-flash`)
3. En el backend Java `dashboard-7spt` → Environment:
   ```
   CONTABLE_API_BASE=https://sig-contabilidad.onrender.com
   ```
   (sin `/` al final)
4. Redeploy Contabilidad + backend (+ frontend si falta el menú)

## IA en la nube (sin instalar Ollama en el PC)

### Opción A — Google Gemini (recomendada en Render)

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=<la misma key del backend SIG>
GEMINI_MODEL=gemini-2.0-flash
```

(o el mismo `GEMINI_MODEL` que el backend, p. ej. `gemini-3.5-flash`)

### Opción B — Ollama Cloud (de pago)

1. API key + créditos en https://ollama.com/settings/keys
2. Env:

```text
AI_PROVIDER=ollama
OLLAMA_URL=https://ollama.com
OLLAMA_API_KEY=<tu_key>
OLLAMA_MODEL=gpt-oss:20b
```

Lista modelos:

```bash
curl https://ollama.com/api/tags -H "Authorization: Bearer TU_KEY"
```

### OCR en Render

El mensaje `OCR debil (0 caracteres)` es de **Tesseract**, no de la IA.
La imagen debe ser JPG/PNG legible. El contenedor incluye `spa` + `eng`.

Health esperado con Gemini:

```json
{"ok":true,"tesseract":true,"ai_provider":"gemini","ai":true,"gemini":true}
```

Detalle completo: [`contabilidad_integracion.md`](./contabilidad_integracion.md)
