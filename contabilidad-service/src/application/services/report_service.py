"""Generación de reportes exportables."""

from __future__ import annotations

import csv
import io
from datetime import datetime

from sqlalchemy.orm import Session

from domain.utils.period_utils import resolve_period
from infrastructure.persistence.models import (
    AccountCrossingModel,
    DocumentModel,
    PaymentModel,
    ProviderModel,
    RemediationModel,
)


class ReportService:
    def __init__(self, db: Session):
        self.db = db

    def _period_filter(self, query, model, date_field: str, **period_kwargs):
        start, end, _ = resolve_period(**period_kwargs)
        col = getattr(model, date_field)
        return query.filter(col >= start, col <= end)

    def export_documents_csv(self, **period_kwargs) -> str:
        q = self.db.query(DocumentModel)
        q = self._period_filter(q, DocumentModel, "received_at", **period_kwargs)
        rows = q.order_by(DocumentModel.received_at.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["id", "filename", "tipo", "estado", "proveedor", "numero", "total", "received_at"]
        )
        for d in rows:
            writer.writerow(
                [
                    d.id,
                    d.filename,
                    d.tipo,
                    d.estado,
                    d.provider.nombre if d.provider else "",
                    d.numero_documento or "",
                    d.total or "",
                    d.received_at.isoformat() if d.received_at else "",
                ]
            )
        return output.getvalue()

    def export_payments_csv(self, **period_kwargs) -> str:
        q = self.db.query(PaymentModel)
        q = self._period_filter(q, PaymentModel, "created_at", **period_kwargs)
        rows = q.order_by(PaymentModel.created_at.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["id", "document_id", "proveedor", "compra", "reserva", "valor", "estado", "created_at"]
        )
        for p in rows:
            writer.writerow(
                [
                    p.id,
                    p.document_id,
                    p.proveedor or "",
                    p.numero_compra or "",
                    p.numero_reserva or "",
                    p.valor or "",
                    p.estado,
                    p.created_at.isoformat() if p.created_at else "",
                ]
            )
        return output.getvalue()

    def export_crossings_csv(self, **period_kwargs) -> str:
        q = self.db.query(AccountCrossingModel)
        q = self._period_filter(q, AccountCrossingModel, "created_at", **period_kwargs)
        rows = q.order_by(AccountCrossingModel.created_at.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "id",
                "document_id",
                "match_type",
                "estado",
                "proveedor",
                "valor_doc",
                "valor_autobits",
                "diferencia",
            ]
        )
        for c in rows:
            writer.writerow(
                [
                    c.id,
                    c.document_id,
                    c.match_type,
                    c.estado,
                    c.proveedor_nombre or "",
                    c.valor_documento or "",
                    c.valor_autobits or "",
                    c.diferencia or "",
                ]
            )
        return output.getvalue()

    def export_remediations_csv(self, **period_kwargs) -> str:
        q = self.db.query(RemediationModel)
        q = self._period_filter(q, RemediationModel, "created_at", **period_kwargs)
        rows = q.order_by(RemediationModel.created_at.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["id", "document_id", "tipo", "descripcion", "valor", "responsable", "estado", "created_at"]
        )
        for r in rows:
            writer.writerow(
                [
                    r.id,
                    r.document_id,
                    r.tipo_problema,
                    r.descripcion,
                    r.valor_involucrado or "",
                    r.responsable or "",
                    r.estado,
                    r.created_at.isoformat() if r.created_at else "",
                ]
            )
        return output.getvalue()

    def export_weekly_html(self, dashboard_kpis: dict) -> str:
        """Reporte semanal HTML simple."""
        p = dashboard_kpis["periodo"]
        c = dashboard_kpis["conteos"]
        t = dashboard_kpis["totales"]
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Reporte semanal — {p['etiqueta']}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 2rem; color: #0e1c2a; }}
    h1 {{ color: #1aa6a0; }}
    table {{ border-collapse: collapse; width: 100%; max-width: 720px; }}
    th, td {{ border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }}
    th {{ background: #f0f7f7; }}
    .muted {{ color: #666; font-size: 0.9rem; }}
  </style>
</head>
<body>
  <h1>Reporte semanal contable</h1>
  <p class="muted">Período: {p['inicio']} → {p['fin']} · Generado: {now}</p>

  <h2>Conteos</h2>
  <table>
    <tr><th>Indicador</th><th>Valor</th></tr>
    <tr><td>Documentos recibidos</td><td>{c['documentos_recibidos']}</td></tr>
    <tr><td>Documentos procesados</td><td>{c['documentos_procesados']}</td></tr>
    <tr><td>Pendientes revisión</td><td>{c['pendientes_revision']}</td></tr>
    <tr><td>Aprobados</td><td>{c['aprobados']}</td></tr>
    <tr><td>Subsanaciones pendientes</td><td>{c['subsanaciones_pendientes']}</td></tr>
    <tr><td>Pagos pendientes</td><td>{c['pagos_pendientes']}</td></tr>
    <tr><td>Pagos realizados</td><td>{c['pagos_realizados']}</td></tr>
    <tr><td>Paquetes pendientes</td><td>{c['paquetes_pendientes']}</td></tr>
    <tr><td>Cruces aprobados</td><td>{c['cruces_aprobados']}</td></tr>
  </table>

  <h2>Totales monetarios</h2>
  <table>
    <tr><th>Concepto</th><th>Valor (COP)</th></tr>
    <tr><td>Total documentos</td><td>{t['valor_documentos']:,.0f}</td></tr>
    <tr><td>Total aprobado</td><td>{t['valor_aprobado']:,.0f}</td></tr>
    <tr><td>Pendiente de pago</td><td>{t['valor_pendiente_pago']:,.0f}</td></tr>
    <tr><td>Pagado</td><td>{t['valor_pagado']:,.0f}</td></tr>
    <tr><td>Por subsanar</td><td>{t['valor_por_subsanar']:,.0f}</td></tr>
  </table>
</body>
</html>"""
