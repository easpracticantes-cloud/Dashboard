"""Tests for needs_com_retry / missing COM filter."""

from application.services.contramarcado_service import ContramarcadoService


class _Doc:
    def __init__(self, com=None):
        self.contramarcado_com = com
        self.contramarcado_status = None
        self.contramarcado = None
        self.extracted_json = None
        self.numero_documento = "123"


def test_needs_com_retry_when_empty():
    assert ContramarcadoService.needs_com_retry(_Doc(None)) is True
    assert ContramarcadoService.needs_com_retry(_Doc("")) is True
    assert ContramarcadoService.needs_com_retry(_Doc("COM pendiente")) is True


def test_needs_com_retry_false_when_has_com():
    assert ContramarcadoService.needs_com_retry(_Doc("COM123456")) is False
    assert ContramarcadoService.needs_com_retry(_Doc("123456")) is False
