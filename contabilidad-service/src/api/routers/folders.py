"""Carpetas semanales de facturas + vínculo Autobits + chat IA conjunto."""

from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from application.services.document_service import DocumentService
from domain.utils.period_utils import week_bounds_saturday
from infrastructure.persistence.database import get_db
from infrastructure.persistence.models import DocumentModel, InvoiceFolderModel
from infrastructure.persistence.repositories import AutobitsRepository, DocumentRepository

router = APIRouter(prefix="/api/folders", tags=["folders"])

ASK_DOC_LIMIT = 80
ASK_AUTOBITS_LIMIT = 120


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    week_label: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    notes: str | None = None


class FolderPatch(BaseModel):
    name: str | None = None
    status: str | None = None
    notes: str | None = None
    autobits_batch_id: int | None = None
    clear_autobits: bool = False


class FolderLinkAutobits(BaseModel):
    batch_id: int


class FolderAddDocuments(BaseModel):
    document_ids: list[int]


class FolderAskRequest(BaseModel):
    pregunta: str


class FolderContramarcadoRequest(BaseModel):
    """Reasigna contramarcado con los COM del Excel Autobits (1 factura → 1 fila).

    El Excel no se modifica. Se limpian COM viejos de las facturas y se vuelve
    a cruzar en exclusivo contra el lote Autobits.
    """

    only_missing_com: bool = False
    reset: bool = True
    autobits_batch_id: int | None = None


def _parse_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[int] = []
    for item in data:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if n > 0 and n not in out:
            out.append(n)
    return out


def _dump_ids(ids: list[int]) -> str:
    clean = [int(i) for i in ids if isinstance(i, int) or str(i).isdigit()]
    uniq: list[int] = []
    for i in clean:
        n = int(i)
        if n > 0 and n not in uniq:
            uniq.append(n)
    return json.dumps(uniq)


def _alive_document_ids(ids: list[int], db: Session) -> list[int]:
    """Quita IDs de facturas que ya no existen (p. ej. tras Vaciar)."""
    if not ids:
        return []
    alive = {
        int(row[0])
        for row in db.query(DocumentModel.id).filter(DocumentModel.id.in_(ids)).all()
    }
    return [i for i in ids if i in alive]


def prune_folder_document_ids(folder: InvoiceFolderModel, db: Session) -> list[int]:
    """Alinea document_ids_json con facturas reales. No hace commit."""
    ids = _parse_ids(folder.document_ids_json)
    kept = _alive_document_ids(ids, db)
    if kept != ids:
        folder.document_ids_json = _dump_ids(kept)
    return kept


def _serialize(folder: InvoiceFolderModel, db: Session | None = None) -> dict:
    ids = prune_folder_document_ids(folder, db) if db else _parse_ids(folder.document_ids_json)
    docs_summary = []
    if db and ids:
        repo = DocumentRepository(db)
        for doc_id in ids:
            doc = repo.get_by_id(doc_id)
            if not doc:
                continue
            docs_summary.append(
                {
                    "id": doc.id,
                    "filename": doc.filename,
                    "estado": doc.estado,
                    "numero_documento": doc.numero_documento,
                    "proveedor_nombre": doc.provider.nombre if doc.provider else None,
                    "total": doc.total,
                    "requiere_revision": bool(doc.requiere_revision),
                    "contramarcado": DocumentService.contramarcado_dict(doc),
                    "fecha_emision": doc.fecha_emision,
                    "tipo": doc.tipo,
                }
            )
    return {
        "id": folder.id,
        "name": folder.name,
        "week_label": folder.week_label,
        "period_start": folder.period_start,
        "period_end": folder.period_end,
        "status": folder.status,
        "document_ids": ids,
        "document_count": len(ids),
        "documents": docs_summary,
        "autobits_batch_id": folder.autobits_batch_id,
        "notes": folder.notes,
        "created_at": folder.created_at.isoformat() if folder.created_at else None,
        "updated_at": folder.updated_at.isoformat() if folder.updated_at else None,
    }


def attach_autobits_batch(folder: InvoiceFolderModel, batch_id: int, db: Session) -> InvoiceFolderModel:
    """Pega el lote Autobits a la carpeta y lo deja persistido."""
    batch = AutobitsRepository(db).get_batch(int(batch_id))
    if not batch:
        raise HTTPException(status_code=404, detail="Lote Autobits no encontrado.")
    folder.autobits_batch_id = int(batch_id)
    if (folder.status or "").upper() in ("", "OPEN"):
        folder.status = "READY"
    try:
        db.commit()
        db.refresh(folder)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo guardar el Excel en la carpeta: {exc.orig if getattr(exc, 'orig', None) else exc}",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando Autobits en la carpeta: {exc}") from exc
    return folder


def serialize_folder(folder: InvoiceFolderModel, db: Session | None = None) -> dict:
    try:
        return _serialize(folder, db)
    except Exception:  # noqa: BLE001
        return _serialize(folder, None)


def _default_week() -> tuple[str, str, str]:
    start, end = week_bounds_saturday(date.today())
    label = f"Semana {start.isoformat()} → {end.isoformat()}"
    return label, start.isoformat(), end.isoformat()


@router.get("")
@router.get("/")
def list_folders(limit: int = 40, db: Session = Depends(get_db)):
    rows = (
        db.query(InvoiceFolderModel)
        .order_by(InvoiceFolderModel.id.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    items = [_serialize(r, db) for r in rows]
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
    return {"total": len(items), "items": items}


@router.post("")
@router.post("/")
def create_folder(body: FolderCreate, db: Session = Depends(get_db)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre de la carpeta es obligatorio.")
    label, start, end = _default_week()
    folder = InvoiceFolderModel(
        name=name,
        week_label=(body.week_label or label).strip(),
        period_start=(body.period_start or start)[:10],
        period_end=(body.period_end or end)[:10],
        status="OPEN",
        document_ids_json="[]",
        notes=(body.notes or "").strip() or None,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _serialize(folder, db)


@router.get("/{folder_id}")
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    payload = _serialize(folder, db)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
    return payload


@router.patch("/{folder_id}")
def patch_folder(folder_id: int, body: FolderPatch, db: Session = Depends(get_db)):
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nombre vacío.")
        folder.name = name
    if body.status is not None:
        folder.status = body.status.strip().upper() or folder.status
    if body.notes is not None:
        folder.notes = body.notes.strip() or None
    if body.clear_autobits:
        folder.autobits_batch_id = None
        try:
            db.commit()
            db.refresh(folder)
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error actualizando la carpeta: {exc}") from exc
        return serialize_folder(folder, db)
    if body.autobits_batch_id is not None:
        attach_autobits_batch(folder, body.autobits_batch_id, db)
        return serialize_folder(folder, db)
    try:
        db.commit()
        db.refresh(folder)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error actualizando la carpeta: {exc}") from exc
    return serialize_folder(folder, db)


@router.post("/{folder_id}/autobits")
def link_autobits(folder_id: int, body: FolderLinkAutobits, db: Session = Depends(get_db)):
    """Vincula un lote Autobits a la carpeta (POST, no PATCH: Nginx/proxy no lo bloquea)."""
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    attach_autobits_batch(folder, body.batch_id, db)
    return serialize_folder(folder, db)


@router.post("/{folder_id}/documents")
def add_documents(folder_id: int, body: FolderAddDocuments, db: Session = Depends(get_db)):
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    current = prune_folder_document_ids(folder, db)
    repo = DocumentRepository(db)
    added = 0
    for raw in body.document_ids or []:
        try:
            doc_id = int(raw)
        except (TypeError, ValueError):
            continue
        if doc_id <= 0 or doc_id in current:
            continue
        if not repo.get_by_id(doc_id):
            continue
        current.append(doc_id)
        added += 1
    folder.document_ids_json = _dump_ids(current)
    db.commit()
    db.refresh(folder)
    return {"ok": True, "added": added, "folder": _serialize(folder, db)}


@router.delete("/{folder_id}/documents/{document_id}")
def remove_document(folder_id: int, document_id: int, db: Session = Depends(get_db)):
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    current = [i for i in _parse_ids(folder.document_ids_json) if i != document_id]
    folder.document_ids_json = _dump_ids(current)
    db.commit()
    db.refresh(folder)
    return {"ok": True, "folder": _serialize(folder, db)}


@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    db.delete(folder)
    db.commit()
    return {"ok": True}


@router.post("/{folder_id}/contramarcado")
def recontramarcado_folder(
    folder_id: int,
    body: FolderContramarcadoRequest | None = None,
    db: Session = Depends(get_db),
):
    """Reasigna CONTRAMARCADO tomando los COM del Excel Autobits.

    1) Sana COM del lote desde columnas canónicas del Excel (sin remapear).
    2) Borra COM viejos de las facturas (pueden estar mal).
    3) Desvincula cruces y vuelve a cruzar 1:1 con el Excel.
    4) Escribe el contramarcado con el COM de la fila Autobits.
    El Excel en pantalla no se reordena ni se reimporta.
    """
    opts = body or FolderContramarcadoRequest()
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")
    batch_id = opts.autobits_batch_id or folder.autobits_batch_id
    if not batch_id:
        raise HTTPException(
            status_code=400,
            detail="Carga el Excel de Autobits y vincúlalo a esta carpeta.",
        )
    from application.services.autobits_service import AutobitsService
    from application.services.contramarcado_service import ContramarcadoService
    from application.services.crossing_service import CrossingService
    from infrastructure.persistence.repositories import CrossingRepository

    ab_service = AutobitsService(db)
    batch = ab_service.repo.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Lote Autobits no encontrado.")
    if folder.autobits_batch_id != batch_id:
        folder.autobits_batch_id = batch_id
        if (folder.status or "").upper() in ("", "OPEN"):
            folder.status = "READY"

    ids = _parse_ids(folder.document_ids_json)
    if not ids:
        raise HTTPException(status_code=400, detail="La carpeta no tiene facturas.")

    repo = DocumentRepository(db)
    docs = []
    for doc_id in ids:
        doc = repo.get_by_id(doc_id)
        if doc:
            docs.append(doc)
    if not docs:
        raise HTTPException(status_code=400, detail="No hay facturas cargables en la carpeta.")

    # 1) COM del Excel canónico en filas Autobits + cruces
    healed = ab_service.repair_records_from_raw(batch_id)
    crossing_svc = CrossingService(db)
    synced = crossing_svc.resync_excel_com_for_batch(batch_id)

    # 2) Limpiar COM viejos de facturas y desvincular para rematch 1:1
    cm_service = ContramarcadoService(db)
    cm_service.clear_for_documents(docs)
    CrossingRepository(db).detach_documents([d.id for d in docs if d.id])

    # 3) Cruce exclusivo + contramarcado con COM del Excel
    match = crossing_svc.run_matching(
        batch_id=batch_id,
        document_ids=[d.id for d in docs if d.id],
        force=True,
        usuario="SISTEMA",
    )

    docs = []
    for doc_id in ids:
        doc = repo.get_by_id(doc_id)
        if doc:
            docs.append(doc)
    updated = sum(1 for d in docs if (d.contramarcado_com or "").strip())
    skipped = max(0, len(docs) - updated)
    items = [
        {
            "id": doc.id,
            "status": doc.contramarcado_status,
            "com": doc.contramarcado_com,
            "value": doc.contramarcado,
            "source": doc.contramarcado_source,
        }
        for doc in docs
    ]

    try:
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()

    return {
        "ok": True,
        "folder_id": folder.id,
        "autobits_batch_id": batch_id,
        "only_missing_com": False,
        "reset": True,
        "excel_com_source": True,
        "healed_rows": healed,
        "synced_crossings": synced,
        "matched": match.get("created", 0) if isinstance(match, dict) else 0,
        "updated": updated,
        "skipped": skipped,
        "total": len(docs),
        "items": items,
        "folder": serialize_folder(folder, db),
        "message": (
            f"Contramarcado con COM del Excel: {updated}/{len(docs)} factura(s). "
            f"Cruce 1:1 de {match.get('created', 0) if isinstance(match, dict) else 0} fila(s)."
        ),
    }


@router.post("/{folder_id}/ask")
def ask_folder(folder_id: int, body: FolderAskRequest, db: Session = Depends(get_db)):
    """Chat IA global: facturas de la carpeta + Autobits vinculado (o último lote)."""
    pregunta = (body.pregunta or "").strip()
    if not pregunta:
        raise HTTPException(status_code=400, detail="Escribe qué quieres analizar.")
    folder = db.get(InvoiceFolderModel, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")

    ids = _parse_ids(folder.document_ids_json)[:ASK_DOC_LIMIT]
    docs = []
    repo = DocumentRepository(db)
    for doc_id in ids:
        doc = repo.get_by_id(doc_id)
        if doc:
            docs.append(doc)

    ab_repo = AutobitsRepository(db)
    batch = None
    if folder.autobits_batch_id:
        batch = ab_repo.get_batch(folder.autobits_batch_id)
    if not batch:
        batch = ab_repo.get_latest_batch()
    autobits = ab_repo.list_records_for_batch(batch.id)[:ASK_AUTOBITS_LIMIT] if batch else []

    if not docs and not autobits:
        raise HTTPException(
            status_code=400,
            detail="La carpeta no tiene facturas ni Autobits para analizar.",
        )

    from application.services.document_processing_service import get_document_processing_service

    processor = get_document_processing_service()
    result = processor.ask_about_documents(pregunta, docs, autobits_records=autobits)
    return {
        "ok": bool(result.get("ok")),
        "respuesta": result.get("respuesta") or "",
        "documentos": int(result.get("documentos") or len(docs)),
        "autobits": len(autobits),
        "folder_id": folder.id,
        "autobits_batch_id": batch.id if batch else None,
        "error": result.get("error"),
    }
