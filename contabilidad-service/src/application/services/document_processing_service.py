"""Servicio unificado de procesamiento de documentos."""

import json
import logging
from datetime import datetime
from pathlib import Path

from config.settings import PROYECTO_RAIZ, get_settings
from domain.enums import DocumentOrigin, DocumentStatus, ProcessingMode
from domain.rules.rule_engine import RuleEngine
from domain.services.confidence_scorer import score_invoice_extraction
from domain.services.duplicate_detector import DuplicateDetector
from exportador import guardar_texto
from infrastructure.ai.ollama_provider import OllamaAIProvider
from infrastructure.ocr.tesseract_provider import TesseractOCRProvider
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.repositories import (
    AuditRepository,
    DocumentRepository,
    ProcessingJobRepository,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class DocumentProcessingService:
    """Orquesta OCR + IA + reglas + persistencia SQLite."""

    def __init__(
        self,
        ocr: TesseractOCRProvider | None = None,
        ai: OllamaAIProvider | None = None,
        rules: RuleEngine | None = None,
    ):
        self.ocr = ocr or TesseractOCRProvider()
        self.ai = ai or OllamaAIProvider()
        self.rules = rules or RuleEngine()
        self.proyecto_raiz = PROYECTO_RAIZ
        self.carpeta_salidas_app = self.proyecto_raiz / "salidas" / "app"
        self.carpeta_preprocesadas = self.carpeta_salidas_app / "imagenes_preprocesadas"
        self.carpeta_textos = self.carpeta_salidas_app / "texto_extraido"
        self.carpeta_respuestas = self.carpeta_salidas_app / "respuestas"

    def verify_dependencies(self) -> list[str]:
        errores = []
        if not self.ocr.verify():
            errores.append("Tesseract OCR no esta disponible.")
        if not self.ai.verify():
            errores.append("Ollama no responde en http://localhost:11434.")
        return errores

    def _ensure_output_dirs(self) -> None:
        for carpeta in (self.carpeta_preprocesadas, self.carpeta_textos, self.carpeta_respuestas):
            carpeta.mkdir(parents=True, exist_ok=True)

    def process_interactive(
        self,
        ruta_imagen: Path,
        solicitud_usuario: str,
        existing_document_id: int | None = None,
    ) -> dict:
        """Procesamiento interactivo — compatible con procesador_interactivo.py."""
        ruta_imagen = Path(ruta_imagen)
        nombre_archivo = ruta_imagen.name
        stem = ruta_imagen.stem

        self._ensure_output_dirs()
        init_db()

        ruta_preprocesada = self.carpeta_preprocesadas / f"{stem}.png"
        ruta_texto = self.carpeta_textos / f"{stem}.txt"
        ruta_respuesta = self.carpeta_respuestas / f"{stem}.txt"
        ruta_metadatos = self.carpeta_respuestas / f"{stem}.json"

        resultado = {
            "archivo": nombre_archivo,
            "ok": False,
            "metodo_ocr": "",
            "caracteres_ocr": 0,
            "respuesta_ia": "",
            "error": "",
            "ruta_respuesta": str(ruta_respuesta),
            "document_id": None,
            "job_id": None,
        }

        db = SessionLocal()
        try:
            doc_repo = DocumentRepository(db)
            job_repo = ProcessingJobRepository(db)
            audit = AuditRepository(db)

            document = doc_repo.get_by_id(existing_document_id) if existing_document_id else None
            if document:
                document.estado = DocumentStatus.PROCESANDO
            else:
                document = doc_repo.create_from_file(
                    ruta_imagen,
                    origen=DocumentOrigin.CARGA_MANUAL,
                    storage_path=str(ruta_imagen),
                )
            job = job_repo.create(
                document.id,
                ProcessingMode.INTERACTIVE,
                solicitud_usuario,
            )
            job_repo.mark_processing(job)
            document.estado = DocumentStatus.PROCESANDO
            db.commit()

            resultado["document_id"] = document.id
            resultado["job_id"] = job.id

            if not self.ocr.preprocess(ruta_imagen, ruta_preprocesada):
                ruta_preprocesada = None

            ocr_result = self.ocr.extract_with_fallback(
                ruta_imagen,
                ruta_preprocesada if ruta_preprocesada and ruta_preprocesada.exists() else None,
            )

            resultado["metodo_ocr"] = ocr_result.method
            resultado["caracteres_ocr"] = len(ocr_result.text.strip())
            guardar_texto(ruta_texto, ocr_result.text)

            if len(ocr_result.text.strip()) < settings.min_caracteres_ocr:
                error = (
                    f"OCR debil ({resultado['caracteres_ocr']} caracteres). "
                    "Prueba con una imagen mas clara."
                )
                resultado["error"] = error
                document.estado = DocumentStatus.REQUIERE_REVISION
                job_repo.mark_requires_review(job)
                audit.log("OCR_DEBIL", "Document", str(document.id), valor_nuevo=error)
                db.commit()
                return resultado

            ai_result = self.ai.extract_custom(ocr_result.text, solicitud_usuario)
            if not ai_result.ok:
                resultado["error"] = ai_result.error
                document.estado = DocumentStatus.ERROR
                job_repo.mark_failed(job, ai_result.error)
                audit.log("IA_ERROR", "Document", str(document.id), valor_nuevo=ai_result.error)
                db.commit()
                return resultado

            respuesta_ia = ai_result.raw_text or ""
            resultado["ok"] = True
            resultado["respuesta_ia"] = respuesta_ia
            ruta_respuesta.write_text(respuesta_ia, encoding="utf-8")

            extracted = dict(ai_result.data)
            conf = score_invoice_extraction(extracted, len(ocr_result.text.strip()))
            extracted["_confidence"] = {"global": conf.global_score, "fields": conf.fields}

            doc_repo.update_extraction(
                document,
                extracted=extracted,
                ocr_text=ocr_result.text,
                metodo_ocr=ocr_result.method,
                estado=DocumentStatus.EXTRAIDO,
                requiere_revision=conf.requiere_revision,
                observaciones=None,
                confidence_global=conf.global_score,
            )
            job_repo.mark_completed(job)
            audit.log(
                "PROCESADO",
                "Document",
                str(document.id),
                valor_nuevo=DocumentStatus.EXTRAIDO,
            )
            db.commit()

            metadatos = {
                "archivo": nombre_archivo,
                "document_id": document.id,
                "job_id": job.id,
                "solicitud_usuario": solicitud_usuario,
                "metodo_ocr": ocr_result.method,
                "caracteres_original": ocr_result.chars_original,
                "caracteres_preprocesada": ocr_result.chars_preprocessed,
                "procesado_en": datetime.now().isoformat(timespec="seconds"),
                "respuesta_ia": respuesta_ia,
                "confidence_global": conf.global_score,
            }
            with ruta_metadatos.open("w", encoding="utf-8") as f:
                json.dump(metadatos, f, ensure_ascii=False, indent=2)

            return resultado

        except Exception as error:
            db.rollback()
            logger.exception("Error procesando documento interactivo")
            resultado["error"] = str(error)
            return resultado
        finally:
            db.close()

    def process_invoice_batch(self, ruta_imagen: Path) -> dict:
        """Procesamiento batch estilo main.py con persistencia."""
        ruta_imagen = Path(ruta_imagen)
        self._ensure_output_dirs()
        init_db()

        db = SessionLocal()
        try:
            doc_repo = DocumentRepository(db)
            job_repo = ProcessingJobRepository(db)
            audit = AuditRepository(db)

            document = doc_repo.create_from_file(
                ruta_imagen,
                origen=DocumentOrigin.BATCH,
                storage_path=str(ruta_imagen),
            )
            job = job_repo.create(document.id, ProcessingMode.INVOICE_BATCH)
            job_repo.mark_processing(job)
            document.estado = DocumentStatus.PROCESANDO
            db.commit()

            stem = ruta_imagen.stem
            ruta_pre = self.proyecto_raiz / "salidas" / "imagenes_preprocesadas" / f"{stem}.png"
            ruta_pre.parent.mkdir(parents=True, exist_ok=True)

            if not self.ocr.preprocess(ruta_imagen, ruta_pre):
                ruta_pre = None

            ocr_result = self.ocr.extract_with_fallback(
                ruta_imagen,
                ruta_pre if ruta_pre and ruta_pre.exists() else None,
            )

            guardar_texto(
                self.proyecto_raiz / "salidas" / "texto_extraido" / f"{stem}.txt",
                ocr_result.text,
            )

            if len(ocr_result.text.strip()) < settings.min_caracteres_ocr:
                document.estado = DocumentStatus.REQUIERE_REVISION
                job_repo.mark_requires_review(job)
                db.commit()
                return {"ok": False, "estado": "revisar", "document_id": document.id}

            ai_result = self.ai.extract_invoice(ocr_result.text)
            if not ai_result.ok:
                document.estado = DocumentStatus.ERROR
                job_repo.mark_failed(job, ai_result.error)
                db.commit()
                return {"ok": False, "estado": "revisar", "document_id": document.id}

            rule = self.rules.evaluate_invoice(ai_result.data)
            conf = score_invoice_extraction(ai_result.data, len(ocr_result.text.strip()))
            extracted = dict(ai_result.data)
            extracted["_confidence"] = {"global": conf.global_score, "fields": conf.fields}
            estado_doc = self.rules.map_estado_documento(rule)
            if rule.estado == "procesado" and not conf.requiere_revision:
                estado_doc = DocumentStatus.PROCESADO
            elif conf.requiere_revision:
                estado_doc = DocumentStatus.REQUIERE_REVISION

            doc_repo.update_extraction(
                document,
                extracted=extracted,
                ocr_text=ocr_result.text,
                metodo_ocr=ocr_result.method,
                estado=estado_doc,
                requiere_revision=rule.requiere_revision or conf.requiere_revision,
                observaciones="; ".join(rule.observaciones) if rule.observaciones else None,
                confidence_global=conf.global_score,
            )

            dup_detector = DuplicateDetector(db)
            nit = extracted.get("nit_o_identificacion")
            if isinstance(extracted.get("proveedor"), dict):
                nit = extracted["proveedor"].get("nit") or nit
            meta_dup = dup_detector.check_metadata(
                nit,
                document.numero_documento,
                document.total,
                exclude_id=document.id,
            )
            if meta_dup.is_duplicate:
                document.estado = DocumentStatus.DUPLICADO
                document.observaciones = meta_dup.reason
                document.requiere_revision = True

            if rule.requiere_revision or rule.estado == "revisar":
                job_repo.mark_requires_review(job)
            else:
                job_repo.mark_completed(job)

            audit.log("BATCH_PROCESADO", "Document", str(document.id), valor_nuevo=estado_doc)
            db.commit()

            return {
                "ok": rule.passed,
                "estado": rule.estado,
                "document_id": document.id,
                "datos": ai_result.data,
                "metodo_ocr": ocr_result.method,
            }

        except Exception as error:
            db.rollback()
            logger.exception("Error en batch")
            return {"ok": False, "estado": "revisar", "error": str(error)}
        finally:
            db.close()

    def persist_batch_side_effect(
        self,
        ruta_imagen: Path,
        datos: dict,
        metodo_ocr: str,
        ocr_text: str,
        estado: str,
        observaciones: str | None,
    ) -> int | None:
        """Persiste resultado batch sin reprocesar — hook para main.py legacy."""
        init_db()
        db = SessionLocal()
        try:
            doc_repo = DocumentRepository(db)
            audit = AuditRepository(db)
            document = doc_repo.create_from_file(ruta_imagen, origen=DocumentOrigin.BATCH)
            rule = self.rules.evaluate_invoice(datos)
            conf = score_invoice_extraction(datos, len(ocr_text.strip()))
            enriched = dict(datos)
            enriched["_confidence"] = {"global": conf.global_score, "fields": conf.fields}
            estado_doc = DocumentStatus.PROCESADO if estado == "procesado" and not conf.requiere_revision else DocumentStatus.REQUIERE_REVISION
            doc_repo.update_extraction(
                document,
                extracted=enriched,
                ocr_text=ocr_text,
                metodo_ocr=metodo_ocr,
                estado=estado_doc,
                requiere_revision=rule.requiere_revision or conf.requiere_revision,
                observaciones=observaciones,
                confidence_global=conf.global_score,
            )
            audit.log("BATCH_PERSIST", "Document", str(document.id), valor_nuevo=estado_doc)
            db.commit()
            return document.id
        except Exception:
            db.rollback()
            logger.exception("No se pudo persistir batch en SQLite")
            return None
        finally:
            db.close()


    def process_by_id(self, document_id: int, solicitud_usuario: str) -> dict:
        """Procesa un documento ya registrado en BD."""
        init_db()
        db = SessionLocal()
        try:
            doc_repo = DocumentRepository(db)
            document = doc_repo.get_by_id(document_id)
            if not document or not document.storage_path:
                return {"ok": False, "error": "Documento no encontrado", "document_id": document_id}
            path = Path(document.storage_path)
            if not path.exists():
                return {"ok": False, "error": "Archivo no encontrado", "document_id": document_id}
        finally:
            db.close()

        result = self.process_interactive(path, solicitud_usuario, existing_document_id=document_id)
        return result


_service: DocumentProcessingService | None = None


def get_document_processing_service() -> DocumentProcessingService:
    global _service
    if _service is None:
        _service = DocumentProcessingService()
    return _service
