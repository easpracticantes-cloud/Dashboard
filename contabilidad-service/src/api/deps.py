"""Dependencias compartidas por los routers.

El microservicio no tiene login propio: el SIG (Spring) autentica con JWT y
reenvía la identidad en cabeceras. Sin cabecera se acepta el ``usuario`` del
cuerpo por compatibilidad, y solo como último recurso se registra ``SISTEMA``.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

HEADER_USUARIO = "X-SIG-Username"
HEADER_ROL = "X-SIG-Role"
USUARIO_SISTEMA = "SISTEMA"

# Roles de operación Contabilidad AP (mutaciones).
ROLES_CONTABILIDAD_WRITE = frozenset(
    {"ADMINISTRADOR", "GERENCIA", "CONTABILIDAD", "SUPERVISOR"}
)

# Reapertura de período: solo gerencia/admin (Fase 4 cierre).
ROLES_REOPEN = frozenset({"ADMINISTRADOR", "GERENCIA"})

_MAX_LONGITUD = 128
_NO_VALIDOS = {"", "-", "null", "none", "undefined", "anonymous", "anonymoususer"}


def resolve_usuario(request: Request | None = None, body_usuario: str | None = None) -> str:
    """Usuario responsable de la acción: cabecera del proxy → cuerpo → SISTEMA."""
    desde_header = _limpiar(request.headers.get(HEADER_USUARIO)) if request is not None else None
    return desde_header or _limpiar(body_usuario) or USUARIO_SISTEMA


def resolve_rol(request: Request | None = None, body_rol: str | None = None) -> str | None:
    """Primer rol SIG declarado por el proxy (informativo / compatibilidad)."""
    roles = resolve_roles(request, body_rol)
    return next(iter(sorted(roles)), None) if roles else None


def resolve_roles(request: Request | None = None, body_rol: str | None = None) -> set[str]:
    """Roles SIG del proxy (``X-SIG-Role`` puede ser lista separada por comas)."""
    raw = None
    if request is not None:
        raw = _limpiar(request.headers.get(HEADER_ROL))
    if not raw:
        raw = _limpiar(body_rol)
    if not raw:
        return set()
    out: set[str] = set()
    for part in raw.replace(";", ",").split(","):
        rol = part.strip().upper()
        if rol.startswith("ROLE_"):
            rol = rol[5:]
        if rol:
            out.add(rol)
    return out


def assert_can_reopen_period(request: Request) -> None:
    """Solo ADMINISTRADOR o GERENCIA pueden reabrir. 403 si no."""
    roles = resolve_roles(request)
    if roles & ROLES_REOPEN:
        return
    raise HTTPException(
        status_code=403,
        detail=(
            "Solo ADMINISTRADOR o GERENCIA pueden reabrir un período cerrado. "
            f"Rol actual: {', '.join(sorted(roles)) or 'desconocido'}."
        ),
    )


def assert_can_write_contabilidad(request: Request) -> None:
    """Exige rol de Contabilidad AP cuando el proxy envía ``X-SIG-Role``.

    Si no hay cabecera de rol (tests / scripts locales), no bloquea: Spring
    Security es la barrera de exposición en producción.
    """
    roles = resolve_roles(request)
    if not roles:
        return
    if roles & ROLES_CONTABILIDAD_WRITE:
        return
    raise HTTPException(
        status_code=403,
        detail=(
            "Rol insuficiente para modificar Contabilidad AP. "
            f"Rol actual: {', '.join(sorted(roles))}."
        ),
    )


def usuario_actual(request: Request) -> str:
    """Dependencia FastAPI para endpoints sin cuerpo (``Depends(usuario_actual)``)."""
    return resolve_usuario(request)


def _limpiar(valor: object | None) -> str | None:
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto or texto.lower() in _NO_VALIDOS:
        return None
    return texto[:_MAX_LONGITUD]
