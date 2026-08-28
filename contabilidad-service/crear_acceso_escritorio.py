"""Crea el acceso directo de Facturas IA en el Escritorio."""

from pathlib import Path
import subprocess
import sys


def obtener_escritorio():
    """Devuelve la ruta del Escritorio del usuario."""
    home = Path.home()
    candidatos = [
        home / "OneDrive" / "Desktop",
        home / "OneDrive" / "Escritorio",
        home / "Desktop",
        home / "Escritorio",
    ]

    for ruta in candidatos:
        if ruta.exists():
            return ruta

    return home / "Desktop"


def crear_acceso_directo():
    """Crea Facturas IA.lnk apuntando directamente a pythonw (sin depender de VBS)."""
    try:
        import win32com.client  # type: ignore
    except ImportError:
        return crear_con_powershell()

    raiz = Path(__file__).resolve().parent
    destino = obtener_escritorio() / "Facturas IA.lnk"
    pythonw = raiz / "venv" / "Scripts" / "pythonw.exe"
    script = raiz / "run_web.py"
    icono = raiz / "assets" / "facturas_ia.ico"

    if not pythonw.exists():
        raise FileNotFoundError(
            f"No se encontrÃ³ el entorno virtual.\nEjecute: python -m venv venv && pip install -r requirements.txt\n{pythonw}"
        )

    shell = win32com.client.Dispatch("WScript.Shell")
    acceso = shell.CreateShortCut(str(destino))
    acceso.TargetPath = str(pythonw)
    acceso.Arguments = f'"{script}"'
    acceso.WorkingDirectory = str(raiz)
    acceso.Description = "Facturas IA - Sistema contable asistido por IA"
    if icono.exists():
        acceso.IconLocation = f"{icono},0"
    acceso.save()
    return destino


def crear_con_powershell():
    """Crea el .lnk usando PowerShell si no hay pywin32."""
    raiz = Path(__file__).resolve().parent
    escritorio = obtener_escritorio()
    destino = escritorio / "Facturas IA.lnk"
    pythonw = raiz / "venv" / "Scripts" / "pythonw.exe"
    script = raiz / "run_web.py"
    icono = raiz / "assets" / "facturas_ia.ico"

    if not pythonw.exists():
        raise FileNotFoundError(f"No se encontrÃ³: {pythonw}")

    ps = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('{destino}')
$Shortcut.TargetPath = '{pythonw}'
$Shortcut.Arguments = '"{script}"'
$Shortcut.WorkingDirectory = '{raiz}'
$Shortcut.Description = 'Facturas IA - Sistema contable asistido por IA'
$Shortcut.IconLocation = '{icono},0'
$Shortcut.Save()
Write-Output $Shortcut.FullName
"""
    resultado = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        check=False,
    )
    if resultado.returncode != 0:
        raise RuntimeError(resultado.stderr or resultado.stdout)
    return destino


if __name__ == "__main__":
    try:
        ruta = crear_acceso_directo()
        print(f"Acceso directo creado: {ruta}")
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

