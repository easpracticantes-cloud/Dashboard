# Despliegue Contabilidad en Render

Para que **Contabilidad** funcione en la página pública (no solo local):

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

## IA en la nube (sin Ollama)

Ollama **no** se instala en Render: es pesado y requiere PC local.
En producción Contabilidad usa **Google Gemini** vía API:

| Variable | Valor recomendado |
|----------|-------------------|
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | misma key del backend |
| `GEMINI_MODEL` | `gemini-2.0-flash` (o el del SIG) |

Health esperado:

```json
{"ok":true,"tesseract":true,"ai_provider":"gemini","ai":true,"ollama":true,"gemini":true}
```

(`ollama: true` aquí significa “motor IA OK” por compatibilidad con la UI.)

Localmente puedes seguir con Ollama (`AI_PROVIDER=ollama` o `auto` sin key).

Detalle completo: [`contabilidad_integracion.md`](./contabilidad_integracion.md)
