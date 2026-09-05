"""Servicio unificado de procesamiento de documentos."""

import json
import logging
from datetime import datetime
from pathlib import Path

from config.settings import PROYECTO_RAIZ, get_settings
from domain.enums import DocumentOrigin, DocumentStatus, ProcessingMode
from domain.rules.rule_engine import RuleEngine
from domain.services.confidence_scorer import confidence_to_dict, score_invoice_extraction
from domain.services.duplicate_detector import DuplicateDetector
from domain.services.invoice_heuristics import extract_invoice_hints, merge_hints_into_extraction
from exportador import guardar_texto
from infrastructure.ai.ai_factory import (
    ai_unavailable_message,
    create_ai_provider,
    resolve_ai_provider_name,
)
from infrastructure.ai.ollama_provider import AIExtractionResult, AIProvider
from infrastructure.ocr.pdf_rasterize import ensure_raster_image, is_pdf
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
        ai: AIProvider | None = None,
        rules: RuleEngine | None = None,
    ):
        self.ocr = ocr or TesseractOCRProvider()
        self.ai = ai or create_ai_provider()
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
            errores.append(ai_unavailable_message())
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

            ocr_debil = len(ocr_result.text.strip()) < settings.min_caracteres_ocr
            if ocr_debil:
                vision_fn = getattr(self.ai, "extract_custom_from_image", None)
                use_vision = (
                    bool(getattr(settings, "gemini_vision_on_weak_ocr", True))
                    and callable(vision_fn)
                    and resolve_ai_provider_name() == "gemini"
                )
                if not use_vision:
                    error = (
                        f"OCR debil ({resultado['caracteres_ocr']} caracteres). "
                        "Prueba con una imagen mas clara (JPG/PNG nitida)."
                    )
                    resultado["error"] = error
                    document.estado = DocumentStatus.REQUIERE_REVISION
                    job_repo.mark_requires_review(job)
                    audit.log("OCR_DEBIL", "Document", str(document.id), valor_nuevo=error)
                    db.commit()
                    return resultado

                logger.info(
                    "OCR debil (%s chars) — Gemini vision sobre %s",
                    resultado["caracteres_ocr"],
                    nombre_archivo,
                )
                ai_result = vision_fn(ruta_imagen, solicitud_usuario)
                resultado["metodo_ocr"] = "GEMINI_VISION"
                if not ai_result.ok:
                    error = (
                        f"OCR debil ({resultado['caracteres_ocr']} caracteres) y "
                        f"vision Gemini fallo: {ai_result.error}"
                    )
                    resultado["error"] = error
                    document.estado = DocumentStatus.REQUIERE_REVISION
                    job_repo.mark_requires_review(job)
                    audit.log("OCR_VISION_FAIL", "Document", str(document.id), valor_nuevo=error)
                    db.commit()
                    return resultado
            else:
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
            conf = score_invoice_extraction(extracted, max(len(ocr_result.text.strip()), 1))
            extracted["_confidence"] = confidence_to_dict(conf)
            extracted["_metodo_ocr"] = resultado["metodo_ocr"]

            doc_repo.update_extraction(
                document,
                extracted=extracted,
                ocr_text=ocr_result.text,
                metodo_ocr=resultado["metodo_ocr"],
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
                "metodo_ocr": resultado["metodo_ocr"],
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

    def _vision_enabled(self) -> bool:
        vision_fn = getattr(self.ai, "extract_invoice_from_image", None)
        return bool(getattr(settings, "gemini_vision_on_weak_ocr", True)) and callable(vision_fn)

    def _ocr_parece_basura(self, text: str) -> bool:
        """OCR con muchos caracteres pero sin señales de factura → forzar visión."""
        from ocr import calcular_puntaje_ocr

        t = (text or "").strip()
        if len(t) < settings.min_caracteres_ocr:
            return True
        score = calcular_puntaje_ocr(t)
        return score["palabras_clave"] < 2 and score["caracteres"] < 400

    def _prepare_image_for_ocr(self, path: Path) -> Path:
        """PDF → PNG; imágenes se dejan igual."""
        work = self.carpeta_preprocesadas
        work.mkdir(parents=True, exist_ok=True)
        return ensure_raster_image(path, work)

    def _finalize_structured_extraction(
        self,
        *,
        db,
        doc_repo: DocumentRepository,
        job_repo: ProcessingJobRepository,
        audit: AuditRepository,
        document,
        job,
        ai_data: dict,
        ocr_text: str,
        metodo_ocr: str,
    ) -> dict:
        """Aplica reglas + confidence + duplicados sobre extracción JSON de factura."""
        hints = extract_invoice_hints(ocr_text)
        extracted = merge_hints_into_extraction(dict(ai_data), hints)
        extracted["_metodo_ocr"] = metodo_ocr
        rule = self.rules.evaluate_invoice(extracted)
        # Vision: no penalizar por OCR corto
        ocr_chars = len((ocr_text or "").strip())
        if str(metodo_ocr).upper().endswith("VISION") or "VISION" in str(metodo_ocr).upper():
            ocr_chars = max(ocr_chars, 800)
        conf = score_invoice_extraction(extracted, ocr_chars)
        extracted["_confidence"] = confidence_to_dict(conf)

        estado_doc = self.rules.map_estado_documento(rule)
        if rule.estado == "procesado" and not conf.requiere_revision:
            estado_doc = DocumentStatus.PROCESADO
        elif conf.requiere_revision or rule.requiere_revision:
            estado_doc = DocumentStatus.REQUIERE_REVISION

        doc_repo.update_extraction(
            document,
            extracted=extracted,
            ocr_text=ocr_text,
            metodo_ocr=metodo_ocr,
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
            fecha_emision=document.fecha_emision,
        )
        if meta_dup.is_duplicate:
            document.estado = DocumentStatus.DUPLICADO
            document.observaciones = meta_dup.reason
            document.requiere_revision = True
            estado_doc = DocumentStatus.DUPLICADO

        if rule.requiere_revision or rule.estado == "revisar" or conf.requiere_revision:
            job_repo.mark_requires_review(job)
        else:
            job_repo.mark_completed(job)

        audit.log("STRUCTURED_PROCESADO", "Document", str(document.id), valor_nuevo=estado_doc)
        db.commit()

        return {
            "ok": True,
            "estado": estado_doc,
            "document_id": document.id,
            "datos": extracted,
            "metodo_ocr": metodo_ocr,
            "confidence_global": conf.global_score,
            "respuesta_ia": json.dumps(
                {k: v for k, v in extracted.items() if not str(k).startswith("_")},
                ensure_ascii=False,
                indent=2,
            ),
            "error": "",
        }

    def process_structured_by_id(self, document_id: int) -> dict:
        """Path de producto: OCR + extract_invoice JSON + reglas (no texto libre)."""
        init_db()
        db = SessionLocal()
        try:
            doc_repo = DocumentRepository(db)
            job_repo = ProcessingJobRepository(db)
            audit = AuditRepository(db)

            document = doc_repo.get_by_id(document_id)
            if not document or not document.storage_path:
                return {"ok": False, "error": "Documento no encontrado", "document_id": document_id}
            path = Path(document.storage_path)
            if not path.exists():
                return {"ok": False, "error": "Archivo no encontrado", "document_id": document_id}

            document.estado = DocumentStatus.PROCESANDO
            job = job_repo.create(document.id, ProcessingMode.INVOICE_BATCH)
            job_repo.mark_processing(job)
            db.commit()

            self._ensure_output_dirs()
            stem = path.stem
            image_path = self._prepare_image_for_ocr(path)
            ruta_pre = self.carpeta_preprocesadas / f"{stem}.png"
            if not self.ocr.preprocess(image_path, ruta_pre):
                ruta_pre = None

            ocr_result = self.ocr.extract_with_fallback(
                image_path,
                ruta_pre if ruta_pre and ruta_pre.exists() else None,
            )
            guardar_texto(self.carpeta_textos / f"{stem}.txt", ocr_result.text)

            ai_result = None
            metodo = ocr_result.method
            ocr_debil = self._ocr_parece_basura(ocr_result.text)
            vision_fn = getattr(self.ai, "extract_invoice_from_image", None)

            if ocr_debil and self._vision_enabled():
                vision_target = image_path if image_path.exists() else path
                provider = resolve_ai_provider_name()
                logger.info(
                    "OCR debil/basura — vision (%s) sobre doc #%s (%s)",
                    provider,
                    document.id,
                    vision_target.name,
                )
                ai_result = vision_fn(vision_target)
                metodo = f"{provider.upper()}_VISION"
                if not ai_result.ok and is_pdf(path) and vision_target != path:
                    # reintento sobre PNG si el path original falló
                    ai_result = vision_fn(image_path)
                if not ai_result.ok:
                    error = f"Vision IA fallo: {ai_result.error}"
                    document.estado = DocumentStatus.REQUIERE_REVISION
                    job_repo.mark_requires_review(job)
                    audit.log("OCR_VISION_FAIL", "Document", str(document.id), valor_nuevo=error)
                    db.commit()
                    return {
                        "ok": False,
                        "error": error,
                        "document_id": document.id,
                        "estado": DocumentStatus.REQUIERE_REVISION,
                    }
            elif ocr_debil:
                error = (
                    f"OCR debil ({len(ocr_result.text.strip())} caracteres) y "
                    "no hay proveedor de vision disponible. "
                    "Sube JPG/PNG nitido o configura Gemini/Anthropic."
                )
                document.estado = DocumentStatus.REQUIERE_REVISION
                job_repo.mark_requires_review(job)
                audit.log("OCR_DEBIL", "Document", str(document.id), valor_nuevo=error)
                db.commit()
                return {
                    "ok": False,
                    "error": error,
                    "document_id": document.id,
                    "estado": DocumentStatus.REQUIERE_REVISION,
                }
            else:
                # Texto OCR + visión de refuerzo si faltan campos clave tras OCR largo
                ai_result = self.ai.extract_invoice(ocr_result.text)
                if ai_result.ok and self._vision_enabled():
                    datos = ai_result.data or {}
                    faltan = not datos.get("total") or not (
                        datos.get("nit_o_identificacion")
                        or (isinstance(datos.get("proveedor"), dict) and datos["proveedor"].get("nit"))
                        or datos.get("numero_factura")
                    )
                    if faltan:
                        logger.info("Extracción incompleta — refuerzo vision doc #%s", document.id)
                        vision_result = vision_fn(image_path if image_path.exists() else path)
                        if vision_result.ok:
                            merged = merge_hints_into_extraction(
                                dict(vision_result.data or {}),
                                extract_invoice_hints(ocr_result.text),
                            )
                            # Completar huecos con lo que sí sacó el OCR+texto
                            merged = merge_hints_into_extraction(
                                merged,
                                {k: v for k, v in datos.items() if v not in (None, "", [], {})},
                            )
                            ai_result = AIExtractionResult(
                                ok=True,
                                data=merged,
                                raw_text=vision_result.raw_text,
                            )
                            metodo = f"{resolve_ai_provider_name().upper()}_VISION+OCR"

            if not ai_result or not ai_result.ok:
                hints = extract_invoice_hints(ocr_result.text)
                utiles = [
                    hints.get("total"),
                    hints.get("numero_factura"),
                    hints.get("nit_o_identificacion"),
                    hints.get("proveedor"),
                ]
                if any(utiles):
                    ai_result = AIExtractionResult(
                        ok=True,
                        data=hints,
                        raw_text=ocr_result.text,
                    )
                    metodo = f"{metodo}+OCR_JSON"
                else:
                    document.estado = DocumentStatus.ERROR
                    job_repo.mark_failed(job, (ai_result.error if ai_result else "sin resultado IA"))
                    audit.log(
                        "IA_ERROR",
                        "Document",
                        str(document.id),
                        valor_nuevo=(ai_result.error if ai_result else "sin resultado"),
                    )
                    db.commit()
                    return {
                        "ok": False,
                        "error": (ai_result.error if ai_result else "No se pudo extraer la factura"),
                        "document_id": document.id,
                        "estado": DocumentStatus.ERROR,
                    }

            return self._finalize_structured_extraction(
                db=db,
                doc_repo=doc_repo,
                job_repo=job_repo,
                audit=audit,
                document=document,
                job=job,
                ai_data=ai_result.data,
                ocr_text=ocr_result.text,
                metodo_ocr=metodo,
            )
        except Exception as error:
            db.rollback()
            logger.exception("Error en process_structured_by_id")
            return {"ok": False, "error": str(error), "document_id": document_id}
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

            ai_result = None
            if len(ocr_result.text.strip()) < settings.min_caracteres_ocr:
                vision_fn = getattr(self.ai, "extract_invoice_from_image", None)
                use_vision = (
                    bool(getattr(settings, "gemini_vision_on_weak_ocr", True))
                    and callable(vision_fn)
                    and resolve_ai_provider_name() == "gemini"
                )
                if use_vision:
                    logger.info("Batch OCR debil — Gemini vision sobre %s", ruta_imagen.name)
                    ai_result = vision_fn(ruta_imagen)
                    if ai_result.ok:
                        ocr_result = type(ocr_result)(
                            text=ocr_result.text or "(vision)",
                            method="GEMINI_VISION",
                            chars_original=ocr_result.chars_original,
                            chars_preprocessed=ocr_result.chars_preprocessed,
                            preprocessed_path=ocr_result.preprocessed_path,
                        )
                    else:
                        document.estado = DocumentStatus.REQUIERE_REVISION
                        job_repo.mark_requires_review(job)
                        db.commit()
                        return {"ok": False, "estado": "revisar", "document_id": document.id}
                else:
                    document.estado = DocumentStatus.REQUIERE_REVISION
                    job_repo.mark_requires_review(job)
                    db.commit()
                    return {"ok": False, "estado": "revisar", "document_id": document.id}

            if ocr_result.method != "GEMINI_VISION":
                ai_result = self.ai.extract_invoice(ocr_result.text)
            if not ai_result or not ai_result.ok:
                document.estado = DocumentStatus.ERROR
                job_repo.mark_failed(job, ai_result.error if ai_result else "sin resultado IA")
                db.commit()
                return {"ok": False, "estado": "revisar", "document_id": document.id}

            return self._finalize_structured_extraction(
                db=db,
                doc_repo=doc_repo,
                job_repo=job_repo,
                audit=audit,
                document=document,
                job=job,
                ai_data=ai_result.data,
                ocr_text=ocr_result.text,
                metodo_ocr=ocr_result.method,
            )

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
            enriched["_confidence"] = confidence_to_dict(conf)
            enriched["_metodo_ocr"] = metodo_ocr
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

    def process_by_id(self, document_id: int, solicitud_usuario: str | None = None) -> dict:
        """Procesa un documento ya registrado — siempre extracción estructurada de factura."""
        # solicitud_usuario se conserva por compatibilidad de firma; el path de producto
        # ya no usa extract_custom (texto libre).
        _ = solicitud_usuario
        return self.process_structured_by_id(document_id)


_service: DocumentProcessingService | None = None


def get_document_processing_service() -> DocumentProcessingService:
    global _service
    if _service is None:
        _service = DocumentProcessingService()
    return _service


def reset_document_processing_service() -> None:
    """Útil en tests / recarga de env."""
    global _service
    _service = None
