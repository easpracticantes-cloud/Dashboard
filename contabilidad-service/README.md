# Sistema Contable IA — Facturas IA

Evolución de la POC **Document AI local** hacia un **Sistema Contable Asistido por IA** con human-in-the-loop, persistencia SQLite, API FastAPI y frontend Angular 19.

> OCR (Tesseract) + IA local (Ollama) + reglas contables + cruce Autobits + pagos manuales + paquetes digitales.

---

## Inicio rápido (aplicación web)

```powershell
cd PoC_OCR_Python-main
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
cd frontend; npm install; npm run build; cd ..

# Requisitos: Tesseract + Ollama con llama3.2
.\venv\Scripts\python.exe run_web.py
```

Abre `http://127.0.0.1:8787` en el navegador (se abre solo).
También puede usar `Lanzar_Facturas_IA.bat` o `Lanzar_Facturas_IA.vbs` (Windows).

### Variables de entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `APP_HOST` | `127.0.0.1` | Use `0.0.0.0` para exponerlo en la red local |
| `APP_PORT` | `8787` | Puerto del servidor |
| `APP_OPEN_BROWSER` | `1` | `0` para no abrir el navegador (servidor) |
| `APP_RELOAD` | `0` | `1` para recarga automática en desarrollo |
| `APP_CORS_ORIGINS` | `*` | Orígenes permitidos, separados por coma |

### Montarlo dentro de un SIG

1. Compile el frontend con la ruta donde vivirá:
   `npm run build -- --base-href=/contable/`
2. Publique `frontend/dist/frontend/browser/` en su servidor web.
3. Si la API queda en otro host, edite `assets/app-config.js` del build:
   `window.__CONTABLE_CONFIG__ = { apiBase: 'https://contable.miempresa.com' };`
4. Arranque el backend con `APP_HOST=0.0.0.0` y declare el origen del SIG en
   `APP_CORS_ORIGINS`.

No hace falta recompilar Angular para cambiar de servidor: `app-config.js`
se lee en tiempo de ejecución.

La app abre en `http://127.0.0.1:8787` con sidebar:

| Módulo | Ruta | Función |
|--------|------|---------|
| Dashboard | `/dashboard` | KPIs semana sáb–vie, exportes |
| Procesamiento | `/procesamiento` | OCR + IA interactivo (legacy) |
| Documentos | `/documentos` | Upload, listado, detalle |
| Autobits | `/autobits` | Import Excel semanal |
| Cruce | `/cruce` | Matching documento ↔ Autobits |
| Subsanaciones | `/subsanaciones` | Errores y seguimiento |
| Pagos | `/pagos` | Aprobación y comprobantes (sin banco) |
| Paquetes | `/paquetes` | ZIP para Katherine |

---

## Flujo contable v1

```text
Autobits (Excel) → Documentos (OCR+IA) → Cruce → Subsanaciones
→ Pagos (manual Bancolombia) → Comprobante → Paquete digital → Katherine
```

**Human-in-the-loop:** matches probables, pagos y excepciones requieren aprobación humana.

**No automatizado en v1:** Bancolombia, WhatsApp, DIAN, API Autobits inventada, Google Drive sin credenciales.

---

## Arquitectura

```text
frontend/ (Angular 19)  →  api_server.py (FastAPI v1.8)
                                │
                    application/services/
                    domain/ (rules, matching, enums)
                    infrastructure/ (OCR, AI, SQLite, storage)
```

### Backend (`src/`)

- `config/settings.py` — configuración centralizada (`.env`)
- `domain/` — RuleEngine, MatchingEngine, ConfidenceScorer
- `application/services/` — DocumentProcessing, Crossing, Payment, Package, Dashboard, Report
- `infrastructure/persistence/` — SQLAlchemy + SQLite (`data/contable.db`)
- `api/routers/` — REST por dominio

### API principal

| Prefijo | Descripción |
|---------|-------------|
| `GET /api/health` | Tesseract + Ollama |
| `POST /api/procesar` | Procesamiento interactivo (legacy) |
| `/api/documents` | Upload y CRUD documentos |
| `/api/autobits` | Preview/import Excel |
| `/api/crossings` | Cruce y aprobación |
| `/api/cruce-excel` | Excel CRUCE DE CUENTAS y pendientes por llenar |
| `/api/remediations` | Subsanaciones |
| `/api/payments` | Pagos y comprobantes |
| `/api/packages` | Paquetes digitales |
| `/api/dashboard` | KPIs y semanas contables |
| `/api/reports` | CSV + reporte HTML semanal |

Documentación interactiva: `http://127.0.0.1:8787/docs`

---

## Configuración

Copie `.env.example` a `.env`:

```env
DATABASE_URL=sqlite:///./data/contable.db
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
STORAGE_PROVIDER=local
GOOGLE_DRIVE_ENABLED=false
MAX_UPLOAD_MB=20
```

---

## Dataset demo

Casos de prueba del prompt maestro (`docs/REQUISITOS_CONTABLES.md` §7):

| Caso | Resultado esperado |
|------|-------------------|
| Factura = Autobits | APROBADO |
| Diferencia de valor | SUBSANACION |
| Sin proveedor | SUBSANACION |
| Compra sin reserva | SUBSANACION |
| Duplicado (NIT+número+total) | DUPLICADO |
| OCR débil | REQUIERE_REVISION |
| Match probable | EN_REVISION → aprobación |

Excel demo: `dataset/demo/autobits_semana_demo.xlsx` (generado por tests).

---

## Tests

```powershell
.\venv\Scripts\python.exe -m pytest tests\ -v --tb=short
cd frontend; npm run build
```

**39 tests** incluyen unitarios, API, casos demo y flujo e2e completo.

---

## POC batch legacy

El flujo original por lotes sigue disponible:

```powershell
# Coloque imágenes en dataset/imagenes/
python src/main.py
```

Salidas en `salidas/` (CSV, JSON, TXT, HTML). Ver sección detallada más abajo.

---

## Requisitos previos

- Python 3.11+ (probado en 3.14)
- Node.js 18+ (frontend Angular)
- Tesseract OCR
- Ollama + modelo `llama3.2`

```powershell
tesseract --version
Invoke-RestMethod http://127.0.0.1:11434/api/version
ollama pull llama3.2
```

---

## Estructura del proyecto

```text
PoC_OCR_Python-main/
├── src/                    # Backend Python
│   ├── api/routers/        # Endpoints REST
│   ├── application/        # Servicios
│   ├── domain/             # Reglas, matching, enums
│   ├── infrastructure/     # OCR, AI, BD, storage
│   ├── api_server.py       # FastAPI app
│   └── main.py             # Batch legacy
├── frontend/               # Angular 19
├── tests/                  # pytest (39 tests)
├── dataset/
│   ├── imagenes/           # Batch POC
│   └── demo/               # Excel demo Autobits
├── data/contable.db        # SQLite (runtime)
├── storage/                # Archivos YYYY/MM/TIPO/
├── docs/
│   ├── ARQUITECTURA_CONTABLE_IA.md
│   └── REQUISITOS_CONTABLES.md
├── run_web.py              # Servidor web (punto de entrada)
└── requirements.txt
```

---

## Limitaciones v1

- No garantiza extracción perfecta — revisión humana obligatoria en casos dudosos
- Pagos ejecutados manualmente fuera del sistema (Bancolombia)
- Google Drive: stub con mensaje "Integración no configurada"
- Procesamiento OCR+IA síncrono en endpoints legacy
- SQLite local — PostgreSQL planificado para producción

---

## Documentación

- [Arquitectura](docs/ARQUITECTURA_CONTABLE_IA.md) — diseño por capas y fases
- [Requisitos contables](docs/REQUISITOS_CONTABLES.md) — RF por módulo

---

## POC batch — referencia detallada

<details>
<summary>Flujo OCR + Ollama por lotes (clic para expandir)</summary>

La POC original procesa imágenes en `dataset/imagenes/`:

```text
imagen → Tesseract OCR (fallback original/preprocesada)
       → Ollama llama3.2 → JSON
       → validador.py → salidas/resultados.csv, reporte.html
```

### Archivos legacy clave

| Archivo | Función |
|---------|---------|
| `src/main.py` | Orquestador batch |
| `src/ocr.py` | OCR + fallback |
| `src/ia_ollama.py` | Extracción IA |
| `src/validador.py` | Validación mínima |
| `src/procesador_interactivo.py` | Flujo interactivo API |

### Ejecutar batch

```powershell
python src/main.py
```

### Campos extraídos

`numero_factura`, `proveedor`, `nit`, `fecha_emision`, `subtotal`, `impuesto`, `total`, `moneda`, `concepto_general`

### Solución de problemas OCR/Ollama

- `TesseractNotFoundError` → instalar Tesseract o `$env:TESSERACT_CMD="C:\Program Files\Tesseract-OCR\tesseract.exe"`
- Ollama no responde → `ollama serve` en otra terminal
- JSON inválido → revisar `salidas/errores.csv` y texto OCR en `salidas/texto_extraido/`

</details>

---

## Comandos útiles

```powershell
# Tests
.\venv\Scripts\python.exe -m pytest tests\ -v

# Servidor API solo
.\venv\Scripts\python.exe -m uvicorn api_server:app --app-dir src --host 127.0.0.1 --port 8787

# Build frontend
cd frontend; npm run build

# Servidor web
.\venv\Scripts\python.exe run_web.py
```

---

**Versión API:** 1.8.0 | **Estado:** Fases 1–9 completadas
