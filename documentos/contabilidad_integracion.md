# Contabilidad IA — integración en SIG

El módulo **Contabilidad** del SIG monta el Sistema Contable IA (OCR + Autobits + cruce + pagos + paquetes).

## Arquitectura

```text
Angular SIG (/app/contabilidad)
   → JWT → Spring Boot /api/v1/contabilidad/**
        → proxy → FastAPI contabilidad-service :8787 /api/**
```

- UI: Angular 21 + Material + tokens EAS (mismo frontend del SIG)
- Backend contable: Python FastAPI (OCR Tesseract + Ollama + Excel)
- Auth: solo vía JWT del SIG (el proxy no reenvía Authorization al FastAPI)

## Arranque local

### 1) Servicio contable

```powershell
cd contabilidad-service
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run_web.py
```

Requisitos opcionales: Tesseract OCR + Ollama (`llama3.2`).

### 2) Backend / Frontend SIG

Con `CONTABLE_API_BASE=http://localhost:8787` (default en `application.yml`).

### Docker Compose

Incluye el servicio `contabilidad` y el backend lo apunta con `CONTABLE_API_BASE=http://contabilidad:8787`.

## Roles

Visible para: `ADMINISTRADOR`, `GERENCIA`, `CONTABILIDAD`, `SUPERVISOR`.

## Código fuente original

Paquete en `contabilidad-service/` (sin el Angular 19 original; la UI vive en `frontend/src/app/features/contabilidad`).
