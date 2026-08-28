# Instalación rápida (paquete de integración)

## 1. Requisitos

- Windows 10/11 (o Linux con Tesseract + Python)
- Python 3.11+
- Tesseract OCR
- Ollama + modelo `llama3.2`

## 2. Instalar

```powershell
cd Sistema_Contable_IA
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements-lock.txt
copy .env.example .env
```

## 3. Arrancar

```powershell
.\venv\Scripts\python.exe run_web.py
```

Abre: **http://127.0.0.1:8787**

## 4. Integrar en SIG

Lea **`docs/INTEGRACION_SIG.md`** (opciones A/B/C, CORS, base-href, API).

## 5. Verificar

```powershell
.\venv\Scripts\python.exe -m pytest -q
```
