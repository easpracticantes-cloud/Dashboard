@echo off
REM Arranca Sistema Contable IA como aplicacion web y abre el navegador.
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
  echo No se encontro el entorno virtual.
  echo Ejecute:  python -m venv venv  ^&^&  venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

if not exist "frontend\dist\frontend\browser\index.html" (
  echo AVISO: falta el build de Angular. Ejecute:
  echo   cd frontend ^&^& npm install ^&^& npm run build
  echo.
)

REM Para exponerlo en la red local descomente la linea siguiente:
REM set APP_HOST=0.0.0.0

title Sistema Contable IA
"%~dp0venv\Scripts\python.exe" "%~dp0run_web.py"

echo.
echo El servidor se detuvo.
pause
