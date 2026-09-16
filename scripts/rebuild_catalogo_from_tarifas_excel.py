# -*- coding: utf-8 -*-
"""Rebuild cotizador portfolios from 2026 Excel masters + Word confirmed overrides."""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

BASE = Path(__file__).resolve().parents[1]
SRC = BASE / "documentos" / "tarifas_fuente_2026"
CATALOG = BASE / "backend" / "src" / "main" / "resources" / "ai" / "catalogo"
DOCS_CAT = BASE / "documentos" / "catalogo"

PRIVADOS_XLSX = "PORTAFOLIO DE COSTOS TOURS  PRIVADOS 2026.xlsx"
CIVITATIS_XLSX = "TARIFAS CIVITATIS 2026 - TOURS COMPARTIDOS 2026.xlsx"

SKIP_SHEETS = {
    "% DE COMISIÓN",
    "TARIFAS GUIAS PRIVADOS",
    "TARIFAS GUIAS",
    "AVENTURA",
    "ECOTURISMO",
    "TURISMO RURAL",
    "TURISMO CULTURAL",
    "TARIFAS AGENCIAS B2B 2026",
    "TARIFAS AGENCIAS B2C 2026",
}

# Stable codes aligned with the existing cotizador catalog.
PRIVADO_SHEET_CODES = {
    "Rapting en el Eje Cafetero": "RAFTING_EN_EL_EJE_CAFETERO",
    "Cabalgata Ecologica": "CABALGATA_ECOLOGICA",
    "Canopy Extremo en el Quindio": "CANOPY_EXTREMO_EN_EL_QUINDIO",
    "Bicirriel en el Quindio": "BICIRRIEL_EN_EL_QUINDIO",
    "Globo Aerostatico": "GLOBO_AEROSTATICO",
    "Parapente": "PARAPENTE",
    "Paramotor": "PARAMOTOR",
    "Santuario de la Palma de cera": "SANTUARIO_DE_LA_PALMA_DE_CERA",
    "Trekking en RN Acaime": "TREKKING_EN_RN_ACAIME",
    "Salento y valle del Cocora": "SALENTO_Y_VALLE_DEL_COCORA",
    "Salento y valle del Cocora mas ": "SALENTO_Y_VALLE_DEL_COCORA_MAS",
    "Recorrido del Monoaullador": "RECORRIDO_DEL_MONOAULLADOR",
    "Ruta Parque de la Vida": "RUTA_PARQUE_DE_LA_VIDA",
    "Ruta Aves y Cafe": "RUTA_AVES_Y_CAFE",
    "Ruta Jardin Botanico": "RUTA_JARDIN_BOTANICO",
    "Ruta Gallito de roca": "RUTA_GALLITO_DE_ROCA",
    "Ruta Cocora ": "RUTA_COCORA",
    "Ruta Reserva Acaime": "RUTA_RESERVA_ACAIME",
    "Ruta Cacique Calarca": "RUTA_CACIQUE_CALARCA",
    "Ruta  Susurro de guaduales": "RUTA_SUSURRO_DE_GUADUALES",
    "Ruta Reserva Kirakai ": "RUTA_RESERVA_KIRAKAI",
    "Pijao, aves y comunidad": "PIJAO_AVES_Y_COMUNIDAD",
    "Paramo de Chili": "PARAMO_DE_CHILI",
    "Volcan el Machin": "VOLCAN_EL_MACHIN",
    "Expedición Murillo": "EXPEDICION_MURILLO",
    "Plan Parque los nevados": "PLAN_PARQUE_LOS_NEVADOS",
    "Senderismo Peñas Blancas": "SENDERISMO_PENAS_BLANCAS",
    " Senderismo Santa Rita ": "SENDERISMO_SANTA_RITA",
    " Senderismo Otun Quimbaya": "SENDERISMO_OTUN_QUIMBAYA",
    "Recorrido por la cordillera": "RECORRIDO_POR_LA_CORDILLERA",
    "Recorrido cafetero con catación": "RECORRIDO_CAFETERO_CON_CATACION",
    "Recorrido cafetero tradicional": "RECORRIDO_CAFETERO_TRADICIONAL",
    "Recorrido cafetero tradicional ": "RECORRIDO_CAFETERO_TRADICIONAL_2",
    "Recorrido la Guayaba": "RECORRIDO_LA_GUAYABA",
    "Programa de Cacao": "PROGRAMA_DE_CACAO",
    "Metodos de Filtrado": "METODOS_DE_FILTRADO",
    "Programa de Permacultura": "PROGRAMA_DE_PERMACULTURA",
    "Crea tu propio souvenir": "CREA_TU_PROPIO_SOUVENIR",
    "City tour por salento": "CITY_TOUR_POR_SALENTO",
    "Programa de cesteria en filandi": "PROGRAMA_DE_CESTERIA_EN_FILANDIA",
    "Taller de cocina de autor": "TALLER_DE_COCINA_DE_AUTOR",
    "Barista por un día": "BARISTA_POR_UN_DIA",
    "Filandia, salento y valle de co": "FILANDIA_SALENTO_Y_VALLE_DE_COCORA",
    "Programa de Cacao + poporo": "PROGRAMA_DE_CACAO_POPORO",
}

CIVITATIS_SHEET_CODES = {
    "Citytour Salento": "CITYTOUR_SALENTO_COMP",
    "Santa rita-Principiantes": "SANTA_RITA_PRINCIPIANTES_COMP",
    "Interpretación_Palma de Cera": "INTERPRETACION_PALMA_DE_CERA_COMP",
    "Kirakai desde Salento": "KIRAKAI_DESDE_SALENTO_COMP",
    "Kirakai desde Filandia": "KIRAKAI_DESDE_FILANDIA_COMP",
    "Pijao, aves y comunidad": "PIJAO_AVES_Y_COMUNIDAD_COMP",
    "Pijao desde Filandia": "PIJAO_DESDE_FILANDIA_COMP",
    "barista por un día en Armenia": "BARISTA_POR_UN_DIA_EN_ARMENIA_COMP",
    "Barista por un día salento fil ": "BARISTA_POR_UN_DIA_SALENTO_FIL_COMP",
    "Metodos de filtrado": "METODOS_DE_FILTRADO_COMP",
    "PEI Filandia Salento Cocora": "PEI_FILANDIA_SALENTO_COCORA_COMP",
    "Armenia-Filandia-Salento-Cocora": "ARMENIA_FILANDIA_SALENTO_COCORA_COMP",
    "Tour Casa de los Colibries": "TOUR_CASA_DE_LOS_COLIBRIES_COMP",
    "Salento y valle del cocora": "SALENTO_Y_VALLE_DEL_COCORA_COMP",
    "Salento y valle del cocora desd": "SALENTO_Y_VALLE_DEL_COCORA_DESD_COMP",
    "filandia,Salento y valle del co": "FILANDIA_SALENTO_Y_VALLE_DEL_CO_COMP",
    "Visita Guiada por Filandia": "VISITA_GUIADA_POR_FILANDIA_COMP",
    "Parque de la vida": "PARQUE_DE_LA_VIDA_COMP",
    "Excursion al Volcan Machin": "EXCURSION_AL_VOLCAN_MACHIN_COMP",
    "Tour por los Miradores de Salen": "TOUR_POR_LOS_MIRADORES_DE_SALEN_COMP",
    "Termales San vicente -Pereira": "TERMALES_SAN_VICENTE_PEREIRA_COMP",
    "Termales San vicente - SALENTO": "TERMALES_SAN_VICENTE_SALENTO_COMP",
    "Termales San vicente - ARMENIA": "TERMALES_SAN_VICENTE_ARMENIA_COMP",
    "Finca Cacaotera": "FINCA_CACAOTERA_COMP",
    "Santuario de la Palma Carbonera": "SANTUARIO_DE_LA_PALMA_CARBONERA_COMP",
    "OTUM QUIMBAYA": "OTUN_QUIMBAYA_COMP",
    "Filandia + Programa de Cacao": "FILANDIA_PROGRAMA_DE_CACAO_COMP",
    "Finca Cafetera": "FINCA_CAFETERA_COMP",
    "Salento y Valle cocora + Cafe": "SALENTO_Y_VALLE_COCORA_CAFE_COMP",
    "Salento y Valle cocora + Cafe d": "SALENTO_Y_VALLE_COCORA_CAFE_D_COMP",
    "Programa de Cafe con termales s": "PROGRAMA_DE_CAFE_CON_TERMALES_S_COMP",
    "Programa de Termales de Santa R": "PROGRAMA_DE_TERMALES_DE_SANTA_R_COMP",
    "PEREIRA Programa de Termales de": "PEREIRA_PROGRAMA_DE_TERMALES_DE_COMP",
}

# Skip non-sale / incomplete Civitatis sheets when present.
CIVITATIS_SKIP = {"TERMALES DE RUIZ", "CORDILLERA"}


def codeify(name: str) -> str:
    s = name.upper()
    for a, b in [
        ("Á", "A"),
        ("É", "E"),
        ("Í", "I"),
        ("Ó", "O"),
        ("Ú", "U"),
        ("Ñ", "N"),
        ("Ü", "U"),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    return s[:80]


def title_case_name(raw: str | None, fallback: str) -> str:
    if not raw:
        return fallback.strip()
    t = re.sub(r"\s+", " ", raw.replace("\n", " ")).strip()
    if t.upper() in {"SUBTOTALES", "TARIFAS 2026"} or len(t) < 3:
        return fallback.strip()
    return t[:120]


def find_pax_cols(rows: list) -> list[tuple[int, int]] | None:
    best = None
    for row in rows[:40]:
        cells = list(row)
        pairs: list[tuple[int, int]] = []
        for j, c in enumerate(cells):
            pax = None
            if isinstance(c, (int, float)) and float(c).is_integer() and 1 <= int(c) <= 20:
                pax = int(c)
            elif isinstance(c, str):
                m = re.match(r"^(\d+)(?:\.0)?(?:\s*pax)?$", c.strip().lower())
                if m:
                    pax = int(m.group(1))
            if pax is not None:
                pairs.append((j, pax))
        if len(pairs) >= 3 and pairs[0][1] == 1 and pairs[1][1] == 2:
            if best is None or len(pairs) > len(best):
                best = pairs
    return best


def row_label(cells: list) -> str:
    for c in cells[:4]:
        if c is not None and str(c).strip():
            return str(c).replace("\n", " ").strip().upper()
    return ""


def extract_product(ws, modality: str, sheet_name: str, code: str, source_file: str):
    rows = list(ws.iter_rows(values_only=True))
    pax_cols = find_pax_cols(rows)
    if not pax_cols:
        return None

    sale_row = None
    min_row = None
    title = None
    for i, row in enumerate(rows[:70]):
        cells = list(row)
        if i < 10 and title is None:
            for c in cells[1:8]:
                if isinstance(c, str) and len(c.strip()) > 4:
                    up = c.upper()
                    if "TARIFA" in up or "SUBTOTAL" in up:
                        continue
                    title = c.strip()
                    break
        label = row_label(cells)
        if not label:
            continue
        if modality == "PRIVADO":
            if "PRECIO DE VENTA CON IVA" in label:
                sale_row = cells
            if "PRECIO MINIMO DE LA EXPERIENCIA ANTES DE IVA" in label:
                min_row = cells
            elif "PRECIO SUGERIDO DE VENTA" in label and "ANTES DE IVA" in label and min_row is None:
                min_row = cells
        else:
            if "PRECIO SUGERIDO DE VENTA" in label and "ANTES" not in label:
                sale_row = cells
            if "PRECIO MINIMO DE LA EXPERIENCIA" in label and "ANTES" not in label and sale_row is None:
                sale_row = cells

    if not sale_row:
        return None

    scale: dict[str, int] = {}
    for j, pax in pax_cols:
        if pax > 12:
            continue
        if j >= len(sale_row):
            continue
        v = sale_row[j]
        if isinstance(v, (int, float)) and float(v) > 0:
            scale[str(pax)] = int(round(float(v)))
    if not scale or "1" not in scale:
        return None

    vmin = None
    if min_row is not None:
        j0 = pax_cols[0][0]
        if j0 < len(min_row) and isinstance(min_row[j0], (int, float)) and min_row[j0] > 0:
            vmin = int(round(float(min_row[j0])))

    name = title_case_name(title, sheet_name)
    keywords = list(
        dict.fromkeys(
            [
                *(w for w in re.split(r"[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]+", name.lower()) if len(w) > 2),
                *(w for w in code.lower().split("_") if len(w) > 2),
            ]
        )
    )[:12]

    return {
        "code": code,
        "name": name,
        "modality": modality,
        "currency": "COP",
        "pricePerPerson1Pax": scale["1"],
        "priceScaleByPax": scale,
        "minPriceBeforeVat1Pax": vmin,
        "includes": None,
        "excludes": None,
        "notes": None,
        "keywords": keywords,
        "active": True,
        "reviewFlag": False,
        "sourceFile": source_file,
    }


def merge_enrichment(new_p: dict, old_by_code: dict[str, dict]) -> dict:
    old = old_by_code.get(new_p["code"])
    if not old:
        return new_p
    # Keep curated display names / copy; Excel titles are often internal labels.
    if old.get("name"):
        new_p["name"] = old["name"]
    for field in ("includes", "excludes", "notes", "keywords"):
        if old.get(field):
            new_p[field] = old[field]
    return new_p


def word_extra_products() -> list[dict]:
    return [
        {
            "code": "CAFE_LA_MORELIA_CATACION_AGENCIAS",
            "name": "Café La Morelia – Tour catación y filtrados (tarifa agencias)",
            "modality": "PRIVADO",
            "currency": "COP",
            "pricePerPerson1Pax": 170000,
            "priceScaleByPax": {
                "1": 170000,
                "2": 140000,
                "3": 140000,
                "4": 140000,
                "5": 120000,
                "6": 120000,
                "7": 120000,
                "8": 120000,
                "9": 120000,
                "10": 105000,
            },
            "minPriceBeforeVat1Pax": None,
            "includes": "Tour de catación y filtrados según programa Morelia.",
            "excludes": None,
            "notes": "Tarifa AGENCIAS 2026 confirmada en Tarifas_y_Proveedores_2026_SIG.docx. No confundir con precio de venta de combos EAS (RECORRIDO_CAFETERO_CON_CATACION).",
            "keywords": ["morelia", "catacion", "filtrados", "cafe", "agencias"],
            "active": True,
            "reviewFlag": False,
            "sourceFile": "Tarifas_y_Proveedores_2026_SIG.docx",
        },
        {
            "code": "ENTRADA_BOSQUE_DE_PALMAS_EAS",
            "name": "Entrada Bosque de Palmas (acuerdo EAS)",
            "modality": "PRIVADO",
            "currency": "COP",
            "pricePerPerson1Pax": 25000,
            "priceScaleByPax": {
                "1": 25000,
                "2": 25000,
                "3": 25000,
                "4": 25000,
                "5": 25000,
                "6": 25000,
            },
            "minPriceBeforeVat1Pax": None,
            "includes": "Entrada al Parque Natural Bosque de Palmas (tarifa acuerdo/precompra).",
            "excludes": "Transporte, guianza, alimentación y demás componentes del tour Cócora.",
            "notes": "Acuerdo EAS $25.000 (pública $30.000). Vigencia desde 01-feb-2026. No reemplaza el tour Salento/Cócora.",
            "keywords": ["bosque de palmas", "entrada", "cocora", "palma"],
            "active": True,
            "reviewFlag": False,
            "sourceFile": "Tarifas_y_Proveedores_2026_SIG.docx",
        },
    ]


def alias_products(by_code: dict[str, dict], old_by_code: dict[str, dict]) -> list[dict]:
    aliases = [
        ("ACAIME", "TREKKING_EN_RN_ACAIME", "Alias de TREKKING_EN_RN_ACAIME / RUTA_RESERVA_ACAIME."),
        ("COCORA", "SALENTO_Y_VALLE_DEL_COCORA", "Alias de SALENTO_Y_VALLE_DEL_COCORA."),
        ("FILANDIA", "VISITA_GUIADA_POR_FILANDIA_COMP", "Alias de VISITA_GUIADA_POR_FILANDIA_COMP."),
        ("TERMALES", "TERMALES_SAN_VICENTE_SALENTO_COMP", "Alias de TERMALES_SAN_VICENTE_SALENTO_COMP."),
        ("CAFE", "FINCA_CAFETERA_COMP", "Alias de FINCA_CAFETERA_COMP. Para privados usar RECORRIDO_CAFETERO_*."),
        ("SALENTO", "CITYTOUR_SALENTO_COMP", "Alias de CITYTOUR_SALENTO_COMP."),
    ]
    out = []
    for alias, target, note in aliases:
        src = by_code.get(target)
        if not src:
            continue
        a = dict(src)
        a["code"] = alias
        a["notes"] = note
        old = old_by_code.get(alias) or {}
        if old.get("name"):
            a["name"] = old["name"]
        a["keywords"] = list(dict.fromkeys([alias.lower(), *(src.get("keywords") or [])]))[:12]
        out.append(a)
    return out


def parse_workbook(path: Path, modality: str, sheet_map: dict[str, str], source_file: str, skip_extra: set[str] | None = None):
    wb = load_workbook(path, read_only=True, data_only=True)
    products = []
    missing = []
    for sn in wb.sheetnames:
        if sn.strip() in SKIP_SHEETS or sn in SKIP_SHEETS:
            continue
        if skip_extra and sn.strip() in skip_extra:
            continue
        if "AGENCIAS" in sn.upper() or "TARIFAS GUIAS" in sn.upper():
            continue
        if sn.strip() in {"AVENTURA", "ECOTURISMO", "TURISMO RURAL", "TURISMO CULTURAL"}:
            continue
        code = sheet_map.get(sn) or sheet_map.get(sn.strip())
        if not code:
            code = codeify(sn.strip())
            if modality == "COMPARTIDO" and not code.endswith("_COMP"):
                code = code + "_COMP"
            missing.append(sn)
        ws = wb[sn]
        prod = extract_product(ws, modality, sn, code, source_file)
        if prod:
            products.append(prod)
        else:
            print(f"WARN no price row: {path.name} / {sn}")
    wb.close()
    if missing:
        print(f"INFO unmapped sheets ({modality}): {missing}")
    return products


def build_packages(by_code: dict[str, dict]) -> list[dict]:
    specs = [
        ("Expedición Murillo 2D/1N", "EXPEDICION_MURILLO", "PRIVADO"),
        ("Plan Parque de los Nevados", "PLAN_PARQUE_LOS_NEVADOS", "PRIVADO"),
        ("Filandia + Programa de Cacao", "FILANDIA_PROGRAMA_DE_CACAO_COMP", "COMPARTIDO"),
        ("Salento + Valle Cócora + Café", "SALENTO_Y_VALLE_COCORA_CAFE_COMP", "COMPARTIDO"),
        ("Salento + Valle Cócora + Café desde Filandia", "SALENTO_Y_VALLE_COCORA_CAFE_D_COMP", "COMPARTIDO"),
        ("Programa Café + Termales", "PROGRAMA_DE_CAFE_CON_TERMALES_S_COMP", "COMPARTIDO"),
        ("Termales Santa Rosa + Café", "PROGRAMA_DE_TERMALES_DE_SANTA_R_COMP", "COMPARTIDO"),
        ("Termales Santa Rosa desde Pereira", "PEREIRA_PROGRAMA_DE_TERMALES_DE_COMP", "COMPARTIDO"),
        ("Filandia + Salento + Valle Cócora", "FILANDIA_SALENTO_Y_VALLE_DE_COCORA", "PRIVADO"),
    ]
    packages = []
    for name, code, modality in specs:
        p = by_code.get(code)
        if not p:
            continue
        packages.append(
            {
                "name": name,
                "priceFromCop": p["pricePerPerson1Pax"],
                "modality": modality,
                "relatedCode": code,
            }
        )
    pijao_c = by_code.get("PIJAO_AVES_Y_COMUNIDAD_COMP")
    pijao_p = by_code.get("PIJAO_AVES_Y_COMUNIDAD")
    if pijao_c and pijao_p:
        packages.append(
            {
                "name": "Pijao + Aves + Comunidad",
                "priceSharedCop": pijao_c["pricePerPerson1Pax"],
                "pricePrivate1PaxCop": pijao_p["pricePerPerson1Pax"],
                "relatedCodes": ["PIJAO_AVES_Y_COMUNIDAD_COMP", "PIJAO_AVES_Y_COMUNIDAD"],
            }
        )
    return packages


def main() -> None:
    old_products = json.loads((CATALOG / "productos.json").read_text(encoding="utf-8"))["products"]
    old_by = {p["code"]: p for p in old_products}
    meta = json.loads((CATALOG / "meta.json").read_text(encoding="utf-8"))
    proveedores = json.loads((CATALOG / "proveedores.json").read_text(encoding="utf-8"))

    privados_path = SRC / PRIVADOS_XLSX
    civitatis_path = SRC / CIVITATIS_XLSX
    if not privados_path.exists() or not civitatis_path.exists():
        raise SystemExit(f"Missing Excel masters under {SRC}")

    products = []
    products.extend(
        parse_workbook(privados_path, "PRIVADO", PRIVADO_SHEET_CODES, PRIVADOS_XLSX)
    )
    products.extend(
        parse_workbook(
            civitatis_path,
            "COMPARTIDO",
            CIVITATIS_SHEET_CODES,
            CIVITATIS_XLSX,
            skip_extra=CIVITATIS_SKIP,
        )
    )

    # Prefer mapped codes; drop accidental duplicates keeping first.
    by_code: dict[str, dict] = {}
    for p in products:
        p = merge_enrichment(p, old_by)
        by_code[p["code"]] = p

    for extra in word_extra_products():
        by_code[extra["code"]] = extra

    for alias in alias_products(by_code, old_by):
        by_code[alias["code"]] = alias

    ordered = sorted(
        by_code.values(),
        key=lambda x: (0 if x["modality"] == "PRIVADO" else 1, x["name"].lower(), x["code"]),
    )

    meta["version"] = "2026.3"
    meta["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    meta["sourceDocument"] = (
        "Tarifas_y_Proveedores_2026_SIG.docx + ACUERDOS_TARIFAS_PROVEEDORES_2026 "
        f"({PRIVADOS_XLSX}; {CIVITATIS_XLSX})"
    )
    meta["packages"] = build_packages(by_code)
    meta["counts"] = {
        "products": len(ordered),
        "providers": len(proveedores.get("providers", [])),
    }

    payload = {"products": ordered}
    proveedores_text = (CATALOG / "proveedores.json").read_text(encoding="utf-8")
    for dest in (CATALOG, DOCS_CAT):
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "productos.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (dest / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (dest / "proveedores.json").write_text(proveedores_text, encoding="utf-8")

    # Keep Word next to fuentes if available.
    src_docx = Path(r"C:\Users\07sam\Downloads\Tarifas_y_Proveedores_2026_SIG.docx")
    if src_docx.exists():
        shutil.copy2(src_docx, BASE / "documentos" / "Tarifas_y_Proveedores_2026_SIG.docx")

    print(f"products={len(ordered)} privados={sum(1 for p in ordered if p['modality']=='PRIVADO')} compartidos={sum(1 for p in ordered if p['modality']=='COMPARTIDO')}")
    print("version", meta["version"])


if __name__ == "__main__":
    main()
