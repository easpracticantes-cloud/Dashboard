# Guía de integración en SIG

Paquete completo del **Sistema Contable IA** (Facturas IA) para montarlo dentro de un SIG existente o consumirlo como microservicio + SPA.

---

## 1. Qué incluye este paquete

| Carpeta / archivo | Contenido |
|-------------------|-----------|
| `src/` | Backend FastAPI, dominio, persistencia SQLite, OCR, Ollama, parsers Excel |
| `frontend/` | Angular 19 (código fuente + `dist/` ya compilado) |
| `tests/` | Suite pytest (58 tests) |
| `scripts/` | Utilidades (limpieza, preparar cruce, empaquetado) |
| `docs/` | Arquitectura, requisitos contables, esta guía |
| `assets/` | Iconos de la app |
| `dataset/` | Excels de demo / referencia |
| `data/` | Base SQLite (`contable.db`) — puede vaciarse con `scripts/limpiar_datos.py` |
| `storage/` | Archivos subidos (facturas, excels, comprobantes) |
| `run_web.py` | **Punto de entrada** del servidor web |
| `requirements.txt` | Dependencias Python |
| `requirements-lock.txt` | Versiones exactas usadas al empaquetar |
| `.env.example` | Plantilla de configuración |

**No incluido (se regenera en destino):** `venv/`, `frontend/node_modules/`, cachés `__pycache__/`.

---

## 2. Flujo contable implementado

```text
1. Excel Autobits (semana sáb–vie)     →  /autobits
2. Facturas / cuentas de cobro (OCR)   →  /documentos
3. Excel CRUCE DE CUENTAS              →  /cruce  (paso 2 en pantalla)
4. Comparación Autobits ↔ Cruce        →  reporte «Qué falta por llenar»
5. Completar factura/CDC y fecha pago  →  tabla de cruce
6. Generar pagos                       →  /pagos
7. Paquete digital                     →  /paquetes
```

El parser del **CRUCE DE CUENTAS** entiende el formato real (bloques por proveedor, columnas FACTURA/CDC, FECHA DE PAGO, etc.) y lo cruza con el último Excel de Autobits por orden de compra / reserva.

---

## 3. Instalación en servidor nuevo

### Requisitos

- Python 3.11+ (probado con 3.14)
- Node.js 20+ (solo si va a recompilar el frontend)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) instalado
- [Ollama](https://ollama.com/) con modelo `llama3.2` (análisis de columnas Excel y OCR asistido)

### Pasos

```powershell
cd Sistema_Contable_IA
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements-lock.txt
# o: pip install -r requirements.txt

copy .env.example .env
# Editar .env según el servidor

# El dist ya viene compilado; solo recompile si cambia rutas del SIG:
# cd frontend && npm install && npm run build -- --base-href=/contable/ && cd ..

.\venv\Scripts\python.exe run_web.py
```

Abrir: `http://127.0.0.1:8787`  
API docs: `http://127.0.0.1:8787/docs`

---

## 4. Integración en el SIG

### Opción A — Mismo dominio (recomendada)

El backend sirve la SPA y la API en un solo puerto:

```text
https://sig.empresa.com/contable/     →  archivos estáticos (frontend/dist/frontend/browser)
https://sig.empresa.com/contable/api/ →  proxy inverso al FastAPI (puerto 8787)
```

Compile con base href:

```bash
cd frontend
npm run build -- --base-href=/contable/
```

Configure el proxy del SIG para reenviar `/contable/api/*` → `http://localhost:8787/api/*`.

### Opción B — API y frontend en hosts distintos

1. Publique `frontend/dist/frontend/browser/` en el servidor web del SIG.
2. Edite en el servidor (sin recompilar):

```javascript
// assets/app-config.js
window.__CONTABLE_CONFIG__ = {
  apiBase: 'https://api-contable.empresa.com'
};
```

3. Arranque el backend:

```powershell
set APP_HOST=0.0.0.0
set APP_PORT=8787
set APP_CORS_ORIGINS=https://sig.empresa.com,https://www.sig.empresa.com
set APP_OPEN_BROWSER=0
python run_web.py
```

### Opción C — Solo API (el SIG tiene su propio frontend)

Consuma los endpoints REST documentados en `/docs`. Los más usados:

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/autobits/upload` | Subir Excel Autobits |
| POST | `/api/cruce-excel/upload` | Subir CRUCE DE CUENTAS |
| GET | `/api/cruce-excel/pendientes` | Qué falta por llenar |
| GET | `/api/crossings` | Listado de cruces |
| PATCH | `/api/crossings/{id}/complete` | Factura/CDC + fecha pago |
| POST | `/api/crossings/seed` | Sincronizar desde Autobits |
| POST | `/api/documents/upload` | Subir facturas |
| GET | `/api/dashboard/kpis` | KPIs semana contable |

---

## 5. Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./data/contable.db` | BD SQLite |
| `STORAGE_ROOT` | `./storage` | Archivos subidos |
| `OLLAMA_URL` | `http://localhost:11434` | Servidor Ollama |
| `OLLAMA_MODEL` | `llama3.2` | Modelo IA |
| `TESSERACT_CMD` | (auto Windows) | Ruta tesseract.exe |
| `APP_HOST` | `127.0.0.1` | Host uvicorn (`0.0.0.0` en servidor) |
| `APP_PORT` | `8787` | Puerto |
| `APP_OPEN_BROWSER` | `1` | Abrir navegador al arrancar |
| `APP_CORS_ORIGINS` | `*` | Orígenes CORS (coma) |
| `MAX_UPLOAD_MB` | `20` | Tamaño máximo upload |

---

## 6. Estructura del backend

```text
src/
  api_server.py              # FastAPI + static Angular
  api/routers/               # REST por dominio
  application/services/      # Lógica de negocio
  domain/                    # Reglas, enums, parsers
  infrastructure/
    persistence/             # SQLAlchemy + SQLite
    autobits/                # Parser Excel Autobits
    cruce/                   # Parser Excel CRUCE DE CUENTAS
    ai/                      # Ollama
    ocr/                     # Tesseract
```

Migraciones SQLite: se aplican al arrancar (`init_db()` en `api_server.py`).

---

## 7. Frontend Angular

```text
frontend/src/app/
  features/          # Pantallas (dashboard, autobits, cruce, pagos…)
  services/          # Clientes HTTP (/api/...)
  core/              # api-base.interceptor + runtime-config
```

El interceptor lee `window.__CONTABLE_CONFIG__.apiBase` para apuntar a otro host de API.

Rutas:

| Ruta | Pantalla |
|------|----------|
| `/dashboard` | KPIs |
| `/autobits` | Import Excel semanal |
| `/cruce` | Cruce + upload CRUCE DE CUENTAS |
| `/documentos` | Facturas OCR |
| `/pagos` | Reporte de pagos |
| `/paquetes` | Paquete digital |
| `/subsanaciones` | Correcciones |

---

## 8. Puesta en producción

```powershell
set APP_HOST=0.0.0.0
set APP_PORT=8787
set APP_OPEN_BROWSER=0
set APP_CORS_ORIGINS=https://su-sig.com
python run_web.py
```

Recomendado detrás de **nginx** o IIS como reverse proxy con HTTPS.

Ejecutar tests antes de desplegar:

```powershell
.\venv\Scripts\python.exe -m pytest -q
```

---

## 9. Datos de prueba / vaciar sistema

```powershell
.\venv\Scripts\python.exe scripts\limpiar_datos.py
```

---

## 10. Contacto técnico / versión

- **Versión API:** 1.10.0 (`api_server.py`)
- **Angular:** 19
- **Empaquetado:** ver `MANIFEST.txt` en la raíz del ZIP
