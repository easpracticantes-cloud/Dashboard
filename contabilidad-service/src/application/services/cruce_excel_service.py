"""Conciliación del Excel «CRUCE DE CUENTAS» contra el Excel de Autobits.

Flujo contable que resuelve:
  1. Se sube el reporte semanal de Autobits (filas que hay que pagar).
  2. Se sube el Excel de cruce de cuentas (lo que ya se digitó a mano).
  3. El sistema compara ambos y dice exactamente qué falta por llenar.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import get_settings
from domain.autobits.observaciones import (
    estado_compra_from_record,
    observaciones_from_record,
    resolve_crossing_estado,
)
from domain.cruce.fields import ParsedCruceRow, crossing_match_keys, fold
from domain.enums import CrossingStatus
from infrastructure.cruce.excel_adapter import CruceExcelAdapter, CruceImportError
from infrastructure.persistence.models import AccountCrossingModel, AutobitsRecordModel
from infrastructure.persistence.repositories import (
    AuditRepository,
    AutobitsRepository,
    CrossingRepository,
)

# Estados que ya no se tocan al aplicar el Excel de cruce
_ESTADOS_CERRADOS = {CrossingStatus.ARCHIVADO}

_TOLERANCIA_VALOR = 1.0


class CruceExcelServiceError(Exception):
    def __init__(self, message: str, code: str = "CRUCE_EXCEL_ERROR", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


@dataclass
class _Pendiente:
    tipo: str
    titulo: str
    detalle: str
    crossing_id: int | None = None
    proveedor: str | None = None
    numero_compra: str | None = None
    numero_reserva: str | None = None
    valor: float | None = None
    origen: str = "sistema"
    hoja: str | None = None
    fila: int | None = None
    celda: str | None = None
    lado_autobits: dict | None = None
    lado_excel: dict | None = None
    copiar: str | None = None

    def to_dict(self) -> dict:
        return {
            "tipo": self.tipo,
            "titulo": self.titulo,
            "detalle": self.detalle,
            "crossing_id": self.crossing_id,
            "proveedor": self.proveedor,
            "numero_compra": self.numero_compra,
            "numero_reserva": self.numero_reserva,
            "valor": self.valor,
            "origen": self.origen,
            "hoja": self.hoja,
            "fila": self.fila,
            "celda": self.celda,
            "lado_autobits": self.lado_autobits or {},
            "lado_excel": self.lado_excel or {},
            "copiar": self.copiar or "",
        }


TIPOS_PENDIENTE: dict[str, str] = {
    "SIN_FACTURA": "Falta FACTURA/CDC",
    "SIN_FECHA_PAGO": "Falta FECHA DE PAGO",
    "SIN_SOPORTE": "Falta adjuntar la factura del proveedor",
    "DIFERENCIA_VALOR": "El valor no coincide",
    "FALTA_EN_CRUCE": "Fila de Autobits que no está en el cruce",
    "SOBRA_EN_CRUCE": "Fila del cruce que no está en Autobits",
}


class CruceExcelService:
    def __init__(self, db: Session):
        self.db = db
        self.autobits_repo = AutobitsRepository(db)
        self.crossing_repo = CrossingRepository(db)
        self.audit = AuditRepository(db)
        self.adapter = CruceExcelAdapter()
        self.settings = get_settings()

    # -- carga del archivo -------------------------------------------------

    def _carpeta_imports(self) -> Path:
        carpeta = Path(self.settings.storage_root) / "cruce" / "imports"
        carpeta.mkdir(parents=True, exist_ok=True)
        return carpeta

    def _carpeta_compare(self) -> Path:
        carpeta = Path(self.settings.storage_root) / "cruce" / "compare"
        carpeta.mkdir(parents=True, exist_ok=True)
        return carpeta

    def _snapshot_path(self, batch_id: int) -> Path:
        return self._carpeta_compare() / f"batch_{batch_id}.json"

    def _guardar(self, content: bytes, filename: str) -> Path:
        nombre = Path(filename or "cruce.xlsx").name
        destino = self._carpeta_imports() / f"{uuid.uuid4().hex[:12]}_{nombre}"
        destino.write_bytes(content)
        return destino

    def procesar_archivo(
        self,
        content: bytes,
        filename: str,
        *,
        aplicar: bool = True,
        usuario: str = "SISTEMA",
        force: bool = False,
    ) -> dict:
        """Lee el Excel de cruce, lo compara con Autobits y opcionalmente lo aplica."""
        if not content:
            raise CruceExcelServiceError("El archivo llegó vacío.", "EMPTY_FILE")

        batch = self.autobits_repo.get_latest_batch()
        if not batch:
            raise CruceExcelServiceError(
                "Primero suba el Excel de Autobits de la semana. "
                "El cruce de cuentas se compara contra ese reporte.",
                "NO_AUTOBITS",
            )

        file_hash = hashlib.sha256(content).hexdigest()
        if not force:
            snap = self._leer_snapshot(batch.id)
            if snap and snap.get("file_hash") == file_hash:
                raise CruceExcelServiceError(
                    f"Este Excel de cruce ya fue cargado ({snap.get('archivo') or filename}). "
                    "No se permiten archivos repetidos.",
                    "DUPLICATE_FILE",
                    status_code=409,
                )

        ruta = self._guardar(content, filename)
        try:
            parsed = self.adapter.parse(ruta)
        except CruceImportError as exc:
            raise CruceExcelServiceError(exc.message, exc.code) from exc

        crossings = self._crossings_del_batch(batch.id)
        indice = self._indexar(crossings)
        periodo_inicio, periodo_fin = self._periodo_efectivo(batch)

        emparejados: dict[int, ParsedCruceRow] = {}
        sobrantes: list[ParsedCruceRow] = []
        fuera_de_periodo = 0
        sin_fecha = 0
        for row in parsed.rows:
            crossing = self._buscar(indice, row)
            if crossing is None:
                # El Excel de cruce es histórico (todo el año); solo se reclaman
                # las filas de la semana del reporte para no llenar de ruido.
                dentro = row.en_periodo(periodo_inicio, periodo_fin)
                if dentro is False:
                    fuera_de_periodo += 1
                elif dentro is None:
                    sin_fecha += 1
                else:
                    sobrantes.append(row)
                continue
            # Si dos filas caen en el mismo cruce, gana la que traiga más datos
            previa = emparejados.get(crossing.id)
            if previa is None or self._riqueza(row) > self._riqueza(previa):
                emparejados[crossing.id] = row

        aplicados = 0
        conflictos: list[dict] = []
        if aplicar:
            aplicados, conflictos = self._aplicar(crossings, emparejados)
            self.audit.log(
                "CRUCE_EXCEL_APLICADO",
                "AccountCrossing",
                str(batch.id),
                valor_nuevo=(
                    f"{aplicados} fila(s) actualizadas desde {Path(filename).name}"
                ),
                usuario=usuario,
            )
            self.db.commit()
            crossings = self._crossings_del_batch(batch.id)

        pendientes = self._detectar_pendientes(
            crossings,
            filas_cruce=parsed.rows,
            emparejados=emparejados,
            sobrantes=sobrantes,
        )

        archivo_nombre = Path(filename or "cruce.xlsx").name
        self._guardar_snapshot(
            batch_id=batch.id,
            archivo=archivo_nombre,
            aplicado=aplicar,
            emparejados=emparejados,
            sobrantes=sobrantes,
            pendientes=pendientes,
            conciliacion={
                "emparejadas": len(emparejados),
                "sin_correspondencia": len(sobrantes),
                "fuera_de_periodo": fuera_de_periodo,
                "sin_fecha": sin_fecha,
                "actualizadas": aplicados,
            },
            file_hash=file_hash,
        )

        return {
            "aplicado": aplicar,
            "archivo": archivo_nombre,
            "batch": self._batch_dict(batch),
            "lectura": {
                "filas_leidas": len(parsed.rows),
                "filas_duplicadas": parsed.skipped_rows,
                "hojas": parsed.sheets,
                "avisos": parsed.warnings,
            },
            "conciliacion": {
                "emparejadas": len(emparejados),
                "sin_correspondencia": len(sobrantes),
                "fuera_de_periodo": fuera_de_periodo,
                "sin_fecha": sin_fecha,
                "actualizadas": aplicados,
                "conflictos": conflictos,
            },
            "comparacion": self._comparacion(crossings, emparejados, sobrantes),
            "pendientes": pendientes,
            "file_hash": file_hash,
        }

    # -- pendientes sin archivo -------------------------------------------

    def pendientes(self, batch_id: int | None = None) -> dict:
        """Qué falta por llenar según el estado actual + último Excel de cruce."""
        batch = None
        if batch_id:
            batch = self.autobits_repo.get_batch(batch_id)
        if not batch:
            batch = self.autobits_repo.get_latest_batch()

        if not batch:
            return {
                "has_autobits": False,
                "batch": None,
                "pendientes": self._vacio(),
                "comparacion": [],
            }

        crossings = self._crossings_del_batch(batch.id)
        pendientes = self._detectar_pendientes(crossings)
        pendientes = self._fusionar_snapshot(batch.id, crossings, pendientes)
        snap = self._leer_snapshot(batch.id)
        sobrantes_info = list((pendientes.get("por_tipo") or {}).get("SOBRA_EN_CRUCE") or [])
        falta_ids: set[int] = set()
        for raw in (snap or {}).get("falta_crossing_ids") or []:
            try:
                falta_ids.add(int(raw))
            except (TypeError, ValueError):
                continue
        return {
            "has_autobits": True,
            "batch": self._batch_dict(batch),
            "pendientes": pendientes,
            "comparacion": self._comparacion(crossings, {}, [], falta_ids=falta_ids),
            "ultimo_cruce": {
                "archivo": (snap or {}).get("archivo"),
                "aplicado": (snap or {}).get("aplicado"),
                "timestamp": (snap or {}).get("timestamp"),
                "sobrantes": len(sobrantes_info),
            }
            if snap
            else None,
        }

    # -- interno -----------------------------------------------------------

    def _crossings_del_batch(self, batch_id: int) -> list[AccountCrossingModel]:
        items, _ = self.crossing_repo.list_crossings(limit=5000, offset=0, batch_id=batch_id)
        return [c for c in items if c.estado not in _ESTADOS_CERRADOS]

    def _periodo_efectivo(self, batch) -> tuple[str | None, str | None]:
        """Semana real del reporte, tomada de las fechas de los registros.

        El período guardado en el lote puede venir de una lectura previa
        demasiado amplia; las fechas de las filas son la fuente confiable.
        """
        fechas = [
            str(r.fecha)[:10]
            for r in self.db.query(AutobitsRecordModel.fecha)
            .filter(AutobitsRecordModel.import_batch_id == batch.id)
            .all()
            if r.fecha
        ]
        if fechas:
            return min(fechas), max(fechas)
        return batch.period_start, batch.period_end

    def _batch_dict(self, batch) -> dict:
        inicio, fin = self._periodo_efectivo(batch)
        return {
            "id": batch.id,
            "filename": batch.filename,
            "period_start": inicio,
            "period_end": fin,
            "imported_rows": batch.imported_rows,
            "imported_at": batch.imported_at.isoformat() if batch.imported_at else "",
        }

    def _indexar(
        self,
        crossings: list[AccountCrossingModel],
    ) -> dict[str, AccountCrossingModel]:
        """Índice por clave de conciliación; las claves fuertes tienen prioridad."""
        indice: dict[str, AccountCrossingModel] = {}
        for crossing in crossings:
            claves = crossing_match_keys(
                proveedor=crossing.proveedor_nombre,
                numero_compra=crossing.numero_compra,
                numero_reserva=crossing.numero_reserva,
                valor=crossing.valor_autobits,
            )
            for clave in claves:
                indice.setdefault(clave, crossing)
        return indice

    def _buscar(
        self,
        indice: dict[str, AccountCrossingModel],
        row: ParsedCruceRow,
    ) -> AccountCrossingModel | None:
        for clave in row.match_keys():
            encontrado = indice.get(clave)
            if encontrado is not None:
                return encontrado
        return None

    def _riqueza(self, row: ParsedCruceRow) -> int:
        return sum(
            1
            for v in (row.factura_cdc, row.fecha_pago, row.valor, row.observaciones)
            if v not in (None, "")
        )

    def _aplicar(
        self,
        crossings: list[AccountCrossingModel],
        emparejados: dict[int, ParsedCruceRow],
    ) -> tuple[int, list[dict]]:
        """Copia FACTURA/CDC y FECHA DE PAGO del Excel a las filas del cruce."""
        por_id = {c.id: c for c in crossings}
        actualizados = 0
        conflictos: list[dict] = []

        for crossing_id, row in emparejados.items():
            crossing = por_id.get(crossing_id)
            if crossing is None:
                continue

            cambio = False

            if row.factura_cdc:
                actual = (crossing.factura_cdc or "").strip()
                if not actual:
                    crossing.factura_cdc = row.factura_cdc
                    cambio = True
                elif fold(actual) != fold(row.factura_cdc):
                    conflictos.append(
                        {
                            "crossing_id": crossing.id,
                            "campo": "factura_cdc",
                            "en_sistema": actual,
                            "en_excel": row.factura_cdc,
                            "proveedor": crossing.proveedor_nombre,
                            "numero_compra": crossing.numero_compra,
                        }
                    )

            if row.fecha_pago:
                actual = (crossing.fecha_pago or "").strip()
                if not actual:
                    crossing.fecha_pago = row.fecha_pago
                    cambio = True
                elif actual != row.fecha_pago:
                    conflictos.append(
                        {
                            "crossing_id": crossing.id,
                            "campo": "fecha_pago",
                            "en_sistema": actual,
                            "en_excel": row.fecha_pago,
                            "proveedor": crossing.proveedor_nombre,
                            "numero_compra": crossing.numero_compra,
                        }
                    )

            if row.observaciones and not (crossing.observaciones or "").strip():
                crossing.observaciones = row.observaciones
                cambio = True

            if cambio:
                crossing.estado = self._estado(crossing)
                actualizados += 1

        if actualizados:
            self.db.flush()
        return actualizados, conflictos

    def _estado(self, crossing: AccountCrossingModel) -> str:
        # Confirmación bancaria (mark_paid): el Excel no debe degradar ni "confirmar" PAGADO.
        if crossing.estado == CrossingStatus.PAGADO:
            return crossing.estado

        estado_compra = None
        observaciones = crossing.observaciones
        if crossing.autobits_record_id:
            record = self.autobits_repo.get_record(crossing.autobits_record_id)
            if record:
                estado_compra = estado_compra_from_record(record)
                observaciones = observaciones or observaciones_from_record(record)

        return resolve_crossing_estado(
            factura_cdc=crossing.factura_cdc,
            fecha_pago=crossing.fecha_pago,
            observaciones=observaciones,
            estado_compra=estado_compra,
        )

    def _vacio(self) -> dict:
        return {
            "total": 0,
            "por_tipo": {tipo: [] for tipo in TIPOS_PENDIENTE},
            "resumen": [],
            "valor_pendiente": 0.0,
        }

    def _guardar_snapshot(
        self,
        *,
        batch_id: int,
        archivo: str,
        aplicado: bool,
        emparejados: dict[int, ParsedCruceRow],
        sobrantes: list[ParsedCruceRow],
        pendientes: dict,
        conciliacion: dict,
        file_hash: str | None = None,
    ) -> None:
        """Persiste el último Autobits↔Cruce para GET /pendientes y export CSV."""
        falta_ids = [
            item.get("crossing_id")
            for item in pendientes.get("por_tipo", {}).get("FALTA_EN_CRUCE", [])
            if item.get("crossing_id") is not None
        ]
        sobra_items = list(pendientes.get("por_tipo", {}).get("SOBRA_EN_CRUCE", []))
        payload = {
            "batch_id": batch_id,
            "archivo": archivo,
            "aplicado": aplicado,
            "file_hash": file_hash,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "emparejadas_ids": sorted(emparejados.keys()),
            "falta_crossing_ids": falta_ids,
            "sobra_items": sobra_items,
            "conciliacion": conciliacion,
        }
        path = self._snapshot_path(batch_id)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _leer_snapshot(self, batch_id: int) -> dict | None:
        path = self._snapshot_path(batch_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return data if isinstance(data, dict) else None

    def _fusionar_snapshot(
        self,
        batch_id: int,
        crossings: list[AccountCrossingModel],
        pendientes: dict,
    ) -> dict:
        """Añade FALTA_EN_CRUCE / SOBRA_EN_CRUCE del último Excel de cruce."""
        snapshot = self._leer_snapshot(batch_id)
        if not snapshot:
            return pendientes

        por_id = {c.id: c for c in crossings}
        falta: list[dict] = []
        for raw_id in snapshot.get("falta_crossing_ids") or []:
            try:
                crossing_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            crossing = por_id.get(crossing_id)
            if crossing is None or crossing.estado == CrossingStatus.PAGADO:
                continue
            falta.append(
                self._pendiente(
                    "FALTA_EN_CRUCE",
                    "Está en Autobits pero no aparece en el Excel de cruce",
                    crossing,
                )
            )

        sobra = list(snapshot.get("sobra_items") or [])
        por_tipo = dict(pendientes.get("por_tipo") or {tipo: [] for tipo in TIPOS_PENDIENTE})
        por_tipo["FALTA_EN_CRUCE"] = falta
        por_tipo["SOBRA_EN_CRUCE"] = sobra

        total = sum(len(v) for v in por_tipo.values())
        resumen = [
            {
                "tipo": tipo,
                "etiqueta": TIPOS_PENDIENTE[tipo],
                "cantidad": len(por_tipo[tipo]),
            }
            for tipo in TIPOS_PENDIENTE
            if por_tipo[tipo]
        ]
        return {
            "total": total,
            "por_tipo": por_tipo,
            "resumen": resumen,
            "valor_pendiente": pendientes.get("valor_pendiente", 0.0),
            "ultimo_cruce": {
                "archivo": snapshot.get("archivo"),
                "aplicado": snapshot.get("aplicado"),
                "timestamp": snapshot.get("timestamp"),
            },
        }

    def _detectar_pendientes(
        self,
        crossings: list[AccountCrossingModel],
        *,
        filas_cruce: list[ParsedCruceRow] | None = None,
        emparejados: dict[int, ParsedCruceRow] | None = None,
        sobrantes: list[ParsedCruceRow] | None = None,
    ) -> dict:
        por_tipo: dict[str, list[dict]] = {tipo: [] for tipo in TIPOS_PENDIENTE}

        for crossing in crossings:
            row = (emparejados or {}).get(crossing.id)
            if crossing.estado == CrossingStatus.PAGADO:
                # Ya cerrada; solo interesa que tenga soporte documental.
                if not crossing.factura_cdc and not crossing.document_id:
                    por_tipo["SIN_FACTURA"].append(
                        self._pendiente(
                            "SIN_FACTURA",
                            "Pagada sin FACTURA/CDC registrada",
                            crossing,
                            row,
                        )
                    )
                continue

            if not (crossing.factura_cdc or "").strip():
                por_tipo["SIN_FACTURA"].append(
                    self._pendiente(
                        "SIN_FACTURA",
                        "Sin número de factura o cuenta de cobro",
                        crossing,
                        row,
                    )
                )

            if not (crossing.fecha_pago or "").strip():
                por_tipo["SIN_FECHA_PAGO"].append(
                    self._pendiente(
                        "SIN_FECHA_PAGO",
                        "Sin fecha de pago",
                        crossing,
                        row,
                    )
                )

            if crossing.document_id is None:
                por_tipo["SIN_SOPORTE"].append(
                    self._pendiente(
                        "SIN_SOPORTE",
                        "No se ha cargado la factura del proveedor",
                        crossing,
                        row,
                    )
                )

            diferencia = crossing.diferencia
            if diferencia is not None and abs(diferencia) > _TOLERANCIA_VALOR:
                por_tipo["DIFERENCIA_VALOR"].append(
                    self._pendiente(
                        "DIFERENCIA_VALOR",
                        f"Diferencia de {abs(diferencia):,.0f} entre factura y Autobits",
                        crossing,
                        row,
                    )
                )

        if filas_cruce is not None:
            ids_emparejados = set((emparejados or {}).keys())
            for crossing in crossings:
                if crossing.id in ids_emparejados:
                    continue
                if crossing.estado == CrossingStatus.PAGADO:
                    continue
                por_tipo["FALTA_EN_CRUCE"].append(
                    self._pendiente(
                        "FALTA_EN_CRUCE",
                        "Está en Autobits pero no aparece en el Excel de cruce",
                        crossing,
                        None,
                    )
                )

            for row in sobrantes or []:
                celda = row.celda_compra or row.celda_factura or f"{row.sheet}!fila {row.row_number}"
                por_tipo["SOBRA_EN_CRUCE"].append(
                    _Pendiente(
                        tipo="SOBRA_EN_CRUCE",
                        titulo="Está en el Excel de cruce pero no en Autobits",
                        detalle=f"Falta en Autobits · pégalo o búscalo en {celda}",
                        proveedor=row.proveedor,
                        numero_compra=row.numero_compra,
                        numero_reserva=row.numero_reserva,
                        valor=row.valor,
                        origen="excel_cruce",
                        hoja=row.sheet,
                        fila=row.row_number,
                        celda=celda,
                        lado_excel={
                            "hoja": row.sheet,
                            "fila": row.row_number,
                            "celda_compra": row.celda_compra,
                            "celda_factura": row.celda_factura,
                            "celda_pago": row.celda_pago,
                            "compra": row.numero_compra,
                            "reserva": row.numero_reserva,
                            "factura": row.factura_cdc,
                            "fecha_pago": row.fecha_pago,
                            "valor": row.valor,
                        },
                        copiar=self._copiar_fila(row),
                    ).to_dict()
                )

        total = sum(len(v) for v in por_tipo.values())
        resumen = [
            {
                "tipo": tipo,
                "etiqueta": TIPOS_PENDIENTE[tipo],
                "cantidad": len(por_tipo[tipo]),
            }
            for tipo in TIPOS_PENDIENTE
            if por_tipo[tipo]
        ]
        valor_pendiente = sum(
            c.valor_autobits or 0
            for c in crossings
            if c.estado != CrossingStatus.PAGADO
        )

        return {
            "total": total,
            "por_tipo": por_tipo,
            "resumen": resumen,
            "valor_pendiente": valor_pendiente,
        }

    def _pendiente(
        self,
        tipo: str,
        detalle: str,
        crossing: AccountCrossingModel,
        row: ParsedCruceRow | None = None,
    ) -> dict:
        celda = None
        if row:
            if tipo == "SIN_FACTURA":
                celda = row.celda_factura
            elif tipo == "SIN_FECHA_PAGO":
                celda = row.celda_pago
            else:
                celda = row.celda_compra or row.celda_factura
        lado_excel = None
        if row:
            lado_excel = {
                "hoja": row.sheet,
                "fila": row.row_number,
                "celda_compra": row.celda_compra,
                "celda_factura": row.celda_factura,
                "celda_pago": row.celda_pago,
                "compra": row.numero_compra,
                "reserva": row.numero_reserva,
                "factura": row.factura_cdc,
                "fecha_pago": row.fecha_pago,
                "valor": row.valor,
            }
        copiar = self._copiar_excel(
            fecha=crossing.fecha_ejecucion,
            compra=crossing.numero_compra,
            reserva=crossing.numero_reserva,
            valor=crossing.valor_autobits,
            factura=(row.factura_cdc if row else crossing.factura_cdc),
            pago=(row.fecha_pago if row else crossing.fecha_pago),
        )
        extra = detalle
        if tipo == "SIN_FACTURA" and celda:
            extra = f"Falta FACTURA/CDC en el Excel · celda {celda}"
        elif tipo == "SIN_FECHA_PAGO" and celda:
            extra = f"Falta FECHA DE PAGO en el Excel · celda {celda}"
        elif tipo == "FALTA_EN_CRUCE":
            extra = (
                f"Está en Autobits y no en el cruce. Copia: {crossing.numero_compra or ''} "
                f"{crossing.numero_reserva or ''} {crossing.valor_autobits or ''}"
            )
        return _Pendiente(
            tipo=tipo,
            titulo=TIPOS_PENDIENTE[tipo],
            detalle=extra,
            crossing_id=crossing.id,
            proveedor=crossing.proveedor_nombre,
            numero_compra=crossing.numero_compra,
            numero_reserva=crossing.numero_reserva,
            valor=crossing.valor_autobits,
            hoja=row.sheet if row else None,
            fila=row.row_number if row else None,
            celda=celda,
            lado_autobits={
                "proveedor": crossing.proveedor_nombre,
                "nit": crossing.nit,
                "compra": crossing.numero_compra,
                "reserva": crossing.numero_reserva,
                "fecha": crossing.fecha_ejecucion,
                "concepto": crossing.concepto,
                "valor": crossing.valor_autobits,
                "factura_sistema": crossing.factura_cdc,
                "fecha_pago_sistema": crossing.fecha_pago,
            },
            lado_excel=lado_excel,
            copiar=copiar,
        ).to_dict()

    def _copiar_excel(
        self,
        *,
        fecha: str | None = None,
        compra: str | None = None,
        reserva: str | None = None,
        valor: float | None = None,
        factura: str | None = None,
        pago: str | None = None,
    ) -> str:
        """Una fila lista para pegar en el bloque del Excel de cruce.

        Orden real de las hojas mensuales:
        FECHA DE EJECUCIÓN | ORDEN DE COMPRA | REF. | VALOR | FACTURA/CDC | FECHA DE PAGO
        """
        monto = ""
        if valor is not None:
            monto = str(int(valor)) if float(valor).is_integer() else str(valor)
        return "\t".join(
            [
                fecha or "",
                compra or "",
                reserva or "",
                monto,
                factura or "",
                pago or "",
            ]
        )

    def _copiar_fila(self, row: ParsedCruceRow) -> str:
        return self._copiar_excel(
            fecha=row.fecha_ejecucion,
            compra=row.numero_compra,
            reserva=row.numero_reserva,
            valor=row.valor,
            factura=row.factura_cdc,
            pago=row.fecha_pago,
        )

    def _comparacion(
        self,
        crossings: list[AccountCrossingModel],
        emparejados: dict[int, ParsedCruceRow],
        sobrantes: list[ParsedCruceRow],
        falta_ids: set[int] | None = None,
    ) -> list[dict]:
        filas: list[dict] = []
        for crossing in crossings:
            row = emparejados.get(crossing.id)
            faltas: list[str] = []
            if not (crossing.factura_cdc or (row.factura_cdc if row else None)):
                faltas.append(
                    f"FACTURA/CDC en Excel"
                    + (f" · {row.celda_factura}" if row and row.celda_factura else "")
                )
            if not (crossing.fecha_pago or (row.fecha_pago if row else None)):
                faltas.append(
                    f"FECHA DE PAGO en Excel"
                    + (f" · {row.celda_pago}" if row and row.celda_pago else "")
                )
            if crossing.document_id is None:
                faltas.append("Soporte de factura (PDF/foto) en el paso 3")
            if row is None:
                if emparejados or (falta_ids is not None and crossing.id in falta_ids):
                    faltas.append("Esta fila de Autobits no está en el Excel de cruce")
            filas.append(
                {
                    "crossing_id": crossing.id,
                    "proveedor": crossing.proveedor_nombre,
                    "lado_autobits": {
                        "compra": crossing.numero_compra,
                        "reserva": crossing.numero_reserva,
                        "fecha": crossing.fecha_ejecucion,
                        "concepto": crossing.concepto,
                        "valor": crossing.valor_autobits,
                    },
                    "lado_excel": {
                        "hoja": row.sheet if row else None,
                        "fila": row.row_number if row else None,
                        "celda_factura": row.celda_factura if row else None,
                        "celda_pago": row.celda_pago if row else None,
                        "factura": (row.factura_cdc if row else None) or crossing.factura_cdc,
                        "fecha_pago": (row.fecha_pago if row else None) or crossing.fecha_pago,
                        "valor": row.valor if row else None,
                    },
                    "faltas": faltas,
                    "accion": (
                        "Pega en el Excel"
                        if row is None
                        else (
                            f"Completa {row.celda_factura or row.celda_pago or row.sheet}"
                            if faltas
                            else f"Ya está en {row.sheet}"
                        )
                    ),
                    "copiar": self._copiar_fila(row)
                    if row
                    else self._copiar_excel(
                        fecha=crossing.fecha_ejecucion,
                        compra=crossing.numero_compra,
                        reserva=crossing.numero_reserva,
                        valor=crossing.valor_autobits,
                        factura=crossing.factura_cdc,
                        pago=crossing.fecha_pago,
                    ),
                }
            )
        for row in sobrantes:
            filas.append(
                {
                    "crossing_id": None,
                    "proveedor": row.proveedor,
                    "lado_autobits": {},
                    "lado_excel": {
                        "hoja": row.sheet,
                        "fila": row.row_number,
                        "celda_factura": row.celda_factura,
                        "celda_pago": row.celda_pago,
                        "factura": row.factura_cdc,
                        "fecha_pago": row.fecha_pago,
                        "valor": row.valor,
                        "compra": row.numero_compra,
                        "reserva": row.numero_reserva,
                    },
                    "faltas": [f"No está en Autobits · {row.celda_compra or row.sheet}"],
                    "accion": f"Revisa {row.celda_compra or row.sheet}",
                    "copiar": self._copiar_fila(row),
                }
            )
        return filas
