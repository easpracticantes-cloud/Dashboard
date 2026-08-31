# Contabilidad IA — integración en SIG (local + Render)

El módulo **Contabilidad** del SIG monta el Sistema Contable IA (OCR + Autobits + cruce + pagos + paquetes).

## Arquitectura

```text
Angular SIG (/app/contabilidad)  [ya en Static Site]
   → JWT → Spring Boot /api/v1/contabilidad/**
        → CONTABLE_API_BASE → FastAPI Contabilidad (Render o local)
```

## Producción (Render) — obligatorio

### 1) Desplegar el servicio Contabilidad

Opción A — Blueprint (`render.yaml`):
1. En Render → **Blueprints** → sincroniza el repo (incluye `sig-contabilidad`).
2. Espera a que el servicio quede **Live**.
3. Copia la URL pública, ej. `https://sig-contabilidad.onrender.com`.

Opción B — Manual:
1. **New → Web Service**
2. Root / Docker: `contabilidad-service`
3. Dockerfile path: `./contabilidad-service/Dockerfile`
4. Health check: `/api/health`
5. Env:
   - `APP_HOST=0.0.0.0`
   - `APP_OPEN_BROWSER=0`
   - `DATABASE_URL=sqlite:////app/data/contable.db`
   - `STORAGE_ROOT=/app/storage`
   - `AI_PROVIDER=gemini`
   - `GEMINI_API_KEY=` (misma key que el backend SIG)
   - `GEMINI_MODEL=gemini-2.0-flash` (o el modelo del SIG)

**Importante:** Ollama no se despliega en Render. La IA de facturas usa **Gemini en la nube** para que la jefa no instale nada.

### 2) Conectar el backend Java (`dashboard-7spt`)

En **Environment** del backend agrega:

```text
CONTABLE_API_BASE=https://sig-contabilidad.onrender.com
```

(sin `/` al final; usa la URL real de tu servicio).

Redeploy del backend.

### 3) Frontend

No requiere variable extra: ya llama a `…/api/v1/contabilidad/**` en el mismo backend.
Tras el deploy del front con el módulo Contabilidad, entra a **Contabilidad** en el menú.

### Notas free plan

- Cold start: la primera petición tras inactividad puede tardar ~30–60 s.
- SQLite en disco efímero: los datos se pierden al redeploy. Para persistir, agrega un **Persistent Disk** en `/app/data` y `/app/storage` (plan pago).

## Local

```powershell
cd contabilidad-service
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python run_web.py
```

Backend con `CONTABLE_API_BASE=http://localhost:8787` (default).

## Roles

`ADMINISTRADOR`, `GERENCIA`, `CONTABILIDAD`, `SUPERVISOR`.
