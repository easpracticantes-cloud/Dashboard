"""Tests duplicados por metadata (NIT + numero + total)."""

import sys
from pathlib import Path
from unittest.mock import MagicMock

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.services.duplicate_detector import DuplicateDetector
from infrastructure.persistence.models import DocumentModel, ProviderModel


def test_duplicate_same_nit_numero_total():
    provider = ProviderModel(nombre="ACME", nit="900123456-1")
    existing = DocumentModel(
        id=7,
        filename="a.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado="PROCESADO",
        numero_documento="FE-100",
        total=150000.0,
        fecha_emision="2026-03-01",
        provider=provider,
    )

    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.all.return_value = [existing]

    detector = DuplicateDetector(db)
    detector.repo = MagicMock()
    detector.repo.db = db

    result = detector.check_metadata(
        nit="900123456-1",
        numero="FE-100",
        total=150000.0,
        exclude_id=99,
        fecha_emision="2026-03-01",
    )
    assert result.is_duplicate is True
    assert result.existing_document_id == 7
    assert "NIT" in result.reason


def test_duplicate_different_nit_not_match():
    provider = ProviderModel(nombre="OTRO", nit="800111222")
    existing = DocumentModel(
        id=7,
        filename="a.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado="PROCESADO",
        numero_documento="FE-100",
        total=150000.0,
        provider=provider,
    )

    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.all.return_value = [existing]

    detector = DuplicateDetector(db)
    detector.repo = MagicMock()
    detector.repo.db = db

    result = detector.check_metadata(
        nit="900123456",
        numero="FE-100",
        total=150000.0,
        exclude_id=99,
    )
    assert result.is_duplicate is False
