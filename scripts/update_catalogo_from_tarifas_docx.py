# -*- coding: utf-8 -*-
"""Actualiza catálogo del cotizador desde Tarifas_y_Proveedores_2026_SIG.docx."""
import json
import re
import shutil
from pathlib import Path

base = Path(r"C:\Users\07sam\Downloads\Proyecto-Pollos-main\Proyecto-Pollos-main")
catalog = base / "backend" / "src" / "main" / "resources" / "ai" / "catalogo"
docs_cat = base / "documentos" / "catalogo"

provs = json.loads((catalog / "proveedores.json").read_text(encoding="utf-8"))
meta = json.loads((catalog / "meta.json").read_text(encoding="utf-8"))
prods = json.loads((catalog / "productos.json").read_text(encoding="utf-8"))

by_code = {p["code"]: p for p in provs["providers"]}


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
        ("–", " "),
        ("—", " "),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    return s[:80]


confirmed_updates = {
    "BOSQUE_DE_PALMAS": {
        "notes": "CONFIRMADA 2026: tarifa pública $30.000; acuerdo/precompra EAS $25.000. Vigencia desde 01-feb-2026. Fuente: Parque Natural Bosque de Palmas 2026.docx",
        "category": "EXPERIENCE",
        "tourCode": "SALENTO_Y_VALLE_DEL_COCORA",
    },
    "BOSQUE_DE_PALMAS_2": {
        "notes": "CONFIRMADA 2026: pública $30.000; acuerdo/precompra $25.000 (desde 01-feb-2026).",
    },
    "CAFE_LA_MORELIA": {
        "notes": "CONFIRMADA 2026 agencias (tour catación/filtrados): 1 pax $170.000; 2–4 $140.000; 5–9 $120.000; 10+ $105.000. NO usar tarifas 2025 ($150k/$120k/$100k/$90k).",
        "category": "EXPERIENCE",
        "tourCode": "RECORRIDO_CAFETERO_CON_CATACION",
    },
    "CINCO_CACAO": {
        "notes": "CONFIRMADA 2026: tabla diferencia precio operador vs precio público. No sustituir operador por público. Fuente: TARIFAS CINCO CACAO.jpeg",
        "tourCode": "PROGRAMA_DE_CACAO",
    },
    "CAFEINA": {
        "notes": "PENDIENTE DE ASOCIACIÓN 2026: aparecen $100.000 y $160.000; identificar producto exacto antes de cotizar. Fuente: CHAT ACUERDO DE TARIFA 2026.",
        "category": "EXPERIENCE",
    },
    "FINCA_EVELYZA": {
        "notes": "CONFIRMADA 2026: comisiónable $10.000. Chat de posible incremento NO es tarifa confirmada.",
        "tourCode": "PROGRAMA_DE_CACAO",
    },
    "FINCA_CACAOTERA_EVELYZA": {
        "notes": "CONFIRMADA 2026: comisiónable $10.000. No inferir aumento desde chat.",
    },
    "FINCA_EL_OCASO": {
        "notes": "CONFIRMADA 2026: existe material tarifario y políticas. Chat indica incremento aún no definido — no inferir aumento. Fuente: TARIFAS AGENCIAS -TOUR CAFETERO 2026.pdf",
        "tourCode": "RECORRIDO_CAFETERO_TRADICIONAL",
    },
    "RESERVA_NATURAL_SANTA_RITA": {
        "notes": "CONFIRMADA 2026: pasadía $11.000/pax; camping $28.000/pax; habitación pareja $140.000; desayuno $12.000; calentado $14.000; almuerzo $18.000; trucha $28.000; parqueadero gratis.",
        "tourCode": "SENDERISMO_SANTA_RITA",
    },
    "RESERVA_NATURAL_SANTA_RITA_2": {
        "notes": "CONFIRMADA 2026: pasadía $11.000; camping $28.000; habitación pareja $140.000; desayuno $12.000; calentado $14.000; almuerzo $18.000; trucha $28.000.",
    },
    "RESTAURANTE_MARIA_OCAMPOS": {
        "notes": "Acuerdo de tarifa 2026 actualizado (imagen). Revisar menú vigente vs valores previos carne/trucha.",
    },
}

new_providers = [
    dict(
        code="OTUN_QUIMBAYA",
        name="OTÚN QUIMBAYA",
        category="EXPERIENCE",
        tourCode="SENDERISMO_OTUN_QUIMBAYA",
        notes="CONFIRMADA 2026: camping $36.000; alojamiento $70.000; pasadía cascada $60.000; plan plato a la carta $84.000; póliza $9.000; guianza personalizada $225.000; recorrido programado $32.000; almuerzo/cena $28.000; plato a la carta $46.000; desayuno $17.000; refrigerio $13.000. Fuente: TARIFAS 2026.pdf",
        priority=85,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="FINCA_LA_ALEJANDRA",
        name="FINCA LA ALEJANDRA",
        category="EXPERIENCE",
        tourCode="RECORRIDO_CAFETERO_TRADICIONAL",
        notes="CONFIRMADA CON CONTEXTO 2026: adulto $55.000 y $80.000; niño 3–9 $45.000 y $55.000 según producto/columna. Conservar asociación exacta. Fuente: Agencias 2026.pdf",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="FINCA_EL_TURPIAL",
        name="FINCA EL TURPIAL",
        category="EXPERIENCE",
        tourCode="RECORRIDO_CAFETERO_TRADICIONAL",
        notes="CONFIRMADA 2026: tarifa $70.000 (imagen FINCA EL TURPIAL TARIFAS 2026 $70000.png).",
        priority=75,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="PARQUE_RECUCA",
        name="PARQUE RECUCA",
        category="EXPERIENCE",
        tourCode="RECORRIDO_CAFETERO_TRADICIONAL",
        notes="CONFIRMADA: tarifas de experiencia vigencia 01-dic-2025 a 30-nov-2026. Respetar vigencia.",
        priority=75,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="LA_BODEGA_PIJAO",
        name="LA BODEGA – PIJAO",
        category="FOOD",
        tourCode="PIJAO_AVES_Y_COMUNIDAD",
        notes="CONFIRMADA 2026 menú: churrasco $40.000; champiñones $45.000; a caballo $45.000; marinero $48.000; almuerzo casero $18.000; lomo de cerdo $35.000; en champiñones $38.000.",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="COOTRANSPIBU",
        name="COOTRANSPIBU",
        category="TRANSPORT",
        tourCode=None,
        notes="CONFIRMADA 2026: Pijao–Palmera $203.800; Pijao–Don Leo $108.900; Rivera del Cacao–Palmera $240.000; Río Verde–Córdoba–Pijao $240.000.",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="COOMODEQUI",
        name="COOMODEQUI",
        category="TRANSPORT",
        tourCode="SALENTO_Y_VALLE_DEL_COCORA",
        notes="CONFIRMADA 2026: tarifas Jeep Willys / Escuela de Aves (xlsx). Diferenciar pública vs negociada EAS.",
        priority=85,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="COOTRACOCORA",
        name="COOTRACOCORA",
        category="TRANSPORT",
        tourCode="SALENTO_Y_VALLE_DEL_COCORA",
        notes="CONFIRMADA 2026: tarifario con incremento (Gmail + TARIFAS COOTRACOCORA.jpeg).",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="BUSES_ARMENIA_SA",
        name="BUSES ARMENIA S.A.",
        category="TRANSPORT",
        tourCode=None,
        notes="CONFIRMADA 2026: TARIFARIO 2026.pdf.",
        priority=75,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="HECTOR_MAURICIO_DUQUE",
        name="HÉCTOR MAURICIO DUQUE",
        category="TRANSPORT",
        tourCode=None,
        notes="CONFIRMADA 2026: tarifario actualizado (xlsx enviado 08/02/2026 + PDFs hechos a mano).",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="LOS_PEREZ",
        name="LOS PÉREZ",
        category="TRANSPORT",
        tourCode=None,
        notes="CONFIRMADA 2026: VALORES RUTAS 2026 LOS PEREZ.xlsx (incl. termales Santa Rosa).",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="MI_TIERRA_TOURS",
        name="MI TIERRA TOURS",
        category="TRANSPORT",
        tourCode=None,
        notes="CONFIRMADA 2026: VALORES RUTAS MI TIERRA TOURS 2026.xlsx + planilla servicios ATI.",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="JEEP_JULIO_CESAR",
        name="JEEP JULIO CÉSAR",
        category="TRANSPORT",
        tourCode="SALENTO_Y_VALLE_DEL_COCORA",
        notes="PENDIENTE: acuerdo telefónico e incremento (audio/imagen). No cargar valor sin confirmación escrita.",
        priority=60,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="DUSTER_EAS",
        name="DUSTER EAS",
        category="TRANSPORT",
        tourCode=None,
        notes="CONFIRMADA 2026: COSTOS RUTA DUSTER RENAULT - EAS.xlsx (costo interno).",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="NATURALEZA_EXTREMA_BICIRRIEL",
        name="NATURALEZA EXTREMA – BICIRRIEL",
        category="EXPERIENCE",
        tourCode="BICIRRIEL_EN_EL_QUINDIO",
        notes="CONFIRMADA 2026: hay tarifa pública y tarifa negociada EAS diferenciadas. No sobrescribir pública con negociada.",
        priority=85,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="CANOPY_BOSQUE_DEL_SAMAN",
        name="CANOPY BOSQUE DEL SAMÁN (ALCALÁ)",
        category="EXPERIENCE",
        tourCode="CANOPY_EXTREMO_EN_EL_QUINDIO",
        notes="CONFIRMADA 2026: COP 45.000 (imagen). Costo proveedor; no usar como precio de venta del tour privado.",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="CANOPY_CARACOLIES",
        name="YOLANDA – CANOPY CARACOLIES",
        category="EXPERIENCE",
        tourCode="CANOPY_EXTREMO_EN_EL_QUINDIO",
        notes="CONFIRMADA 2026: tarifas en imágenes parte 1 y 2. Costo proveedor.",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="DON_MANOLO",
        name="CAFÉ DON MANOLO",
        category="EXPERIENCE",
        tourCode="RECORRIDO_CAFETERO_TRADICIONAL",
        notes="Fuente 2026: CAFE DON MANOLO 2026.pdf. Validar valores antes de cotizar solo el proveedor.",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="FINCA_EL_DIAMANTE",
        name="FINCA EL DIAMANTE",
        category="EXPERIENCE",
        tourCode="RECORRIDO_CAFETERO_TRADICIONAL",
        notes="PENDIENTE: experiencia 2026 + posible incremento (jpg). No inferir aumento.",
        priority=65,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="CAFE_TIENDA_DE_LOS_MECATOS",
        name="CAFÉ TIENDA DE LOS MECATOS",
        category="EXPERIENCE",
        tourCode="RECORRIDO_CAFETERO_TRADICIONAL",
        notes="Fuente: P. comercial Coffee Tour T.Neta.pdf.",
        priority=65,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="MUSEO_FOTOGRAFICO_SALENTO",
        name="MUSEO FOTOGRÁFICO SALENTO",
        category="EXPERIENCE",
        tourCode="CITY_TOUR_POR_SALENTO",
        notes="Fuente 2026: TARIFAS MUSEO FOTOGRÁFICO SALENTO. Validar valor exacto desde imagen.",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="TERMALES_SAN_VICENTE",
        name="TERMALES DE SAN VICENTE",
        category="EXPERIENCE",
        tourCode="TERMALES_SAN_VICENTE_SALENTO_COMP",
        notes="CONFIRMADA 2026: tarifas 2026.jpeg + experiencias bienestar/oxígeno/vital.",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="TERMALES_SANTA_ROSA",
        name="TERMALES DE SANTA ROSA",
        category="EXPERIENCE",
        tourCode="PROGRAMA_DE_TERMALES_DE_SANTA_R_COMP",
        notes="Material 2026 (WhatsApp images). Conservar temporada/turno; cruzar con política POL_TERMAL_SANTA_ROSA.",
        priority=80,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="BRUNCH_SALENTO",
        name="BRUNCH SALENTO",
        category="FOOD",
        tourCode="CITY_TOUR_POR_SALENTO",
        notes="CONFIRMADA 2026: pack lunches + menú brunch.",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="LAURITA_CAMPESTRE",
        name="DONDE LAURITA CAMPESTRE",
        category="FOOD",
        tourCode="SALENTO_Y_VALLE_DEL_COCORA",
        notes="CONFIRMADA 2026: TARIFAS LAURITA CAMPESTRE 2026.png.",
        priority=75,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="TIENDA_DEL_BUEN_VIVIR",
        name="LA TIENDA DEL BUEN VIVIR",
        category="FOOD",
        tourCode="PIJAO_AVES_Y_COMUNIDAD",
        notes="CONFIRMADA 2026: TARIFAS DEL BUEN VIVIR 2026.png.",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="ALVARO_LOZANO_LOS_GALLEGO",
        name="ÁLVARO LOZANO – FINCA LOS GALLEGO",
        category="FOOD",
        tourCode=None,
        notes="Acuerdo de tarifa 2026 (chat). Validar valores exactos.",
        priority=65,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="RURAL_COCINA",
        name="RURAL COCINA",
        category="FOOD",
        tourCode=None,
        notes="PENDIENTE: chat acuerdo 2026. Confirmar tarifa definitiva.",
        priority=60,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="MULADAR_FILANDIA",
        name="MULADAR FILANDIA",
        category="FOOD",
        tourCode="FILANDIA",
        notes="Brochure 2025-26. Validar precios vigentes 2026.",
        priority=65,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
    dict(
        code="PAILART",
        name="PAILART",
        category="SOUVENIR",
        tourCode="CREA_TU_PROPIO_SOUVENIR",
        notes="CONFIRMADA 2026: TARIFAS DE PAILARTE 2026.png.",
        priority=70,
        active=True,
        contact=None,
        sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
    ),
]

guides = [
    "BLANEY GERARDO ARISTIZABAL",
    "CAMILO ANDRES MOLINA",
    "CESAR AUGUSTO CASAS",
    "DIEGO ALEJANDRO GALVIS",
    "JAIRO ALONSO PINO",
    "JORGE LEONARDO CHICA",
    "JOSE MIGUEL RAMIREZ",
    "JOSE ROMEL DUQUE",
    "JUAN DAVID VILLA",
    "NATALIA GARCIA GONZALEZ",
    "SANTIAGO NIETO FURQUE",
]
for g in guides:
    c = codeify(g)
    note = (
        "Guía EAS. Tarifas 2025 históricas ($190.000–$250.000) NO cargar como 2026 sin fuente 2026."
    )
    if "BLANEY" in c:
        note = "HISTÓRICO 2025: $230.000 medio día (informe guianzas). NO automático para 2026 sin fuente 2026."
    new_providers.append(
        dict(
            code=c,
            name=g,
            category="GUIDE",
            tourCode=None,
            notes=note,
            priority=70,
            active=True,
            contact=None,
            sourceFile="Tarifas_y_Proveedores_2026_SIG.docx",
        )
    )

updated = 0
for code, patch in confirmed_updates.items():
    if code in by_code:
        by_code[code].update({k: v for k, v in patch.items() if v is not None})
        by_code[code]["sourceFile"] = "Tarifas_y_Proveedores_2026_SIG.docx"
        updated += 1

added = 0
for np in new_providers:
    if np["code"] not in by_code:
        by_code[np["code"]] = np
        added += 1
    else:
        cur = by_code[np["code"]]
        if np.get("notes") and (
            not cur.get("notes")
            or "CONFIRMADA" in (np.get("notes") or "")
            or "PENDIENTE" in (np.get("notes") or "")
            or "HISTÓRICO" in (np.get("notes") or "")
        ):
            if ("CONFIRMADA" in (np.get("notes") or "")) or ("HISTÓRICO" in (np.get("notes") or "")) or (not cur.get("notes")):
                cur["notes"] = np["notes"]
                cur["sourceFile"] = "Tarifas_y_Proveedores_2026_SIG.docx"
                if np.get("category"):
                    cur["category"] = np["category"]
                updated += 1

providers_list = sorted(
    by_code.values(), key=lambda x: (x.get("category") or "", x.get("name") or "")
)
provs_out = {"providers": providers_list}

meta["version"] = "2026.2"
meta["generatedAt"] = "2026-09-16T17:00:00.000Z"
meta["sourceDocument"] = "Tarifas_y_Proveedores_2026_SIG.docx"

policy_by = {p["code"]: p for p in meta.get("policies", [])}
policy_by["POL_MORELIA"] = {
    "code": "POL_MORELIA",
    "appliesTo": "CAFE_LA_MORELIA",
    "rule": "Agencias 2026 (catación/filtrados): 1 pax $170.000; 2–4 $140.000; 5–9 $120.000; 10+ $105.000. No usar tarifas 2025.",
}
policy_by["POL_BOSQUE_PALMAS"] = {
    "code": "POL_BOSQUE_PALMAS",
    "appliesTo": "BOSQUE_DE_PALMAS",
    "rule": "2026 desde 01-feb: pública $30.000; acuerdo/precompra EAS $25.000. No mezclar con precio de venta del tour Cócora.",
}
policy_by["POL_SANTA_RITA"] = {
    "code": "POL_SANTA_RITA",
    "appliesTo": "SENDERISMO_SANTA_RITA",
    "rule": "Costos proveedor 2026: pasadía $11.000; camping $28.000; habitación pareja $140.000; desayuno $12.000; calentado $14.000; almuerzo $18.000; trucha $28.000.",
}
policy_by["POL_OTUN"] = {
    "code": "POL_OTUN",
    "appliesTo": "SENDERISMO_OTUN_QUIMBAYA",
    "rule": "Costos Otún 2026: camping $36.000; alojamiento $70.000; pasadía cascada $60.000; recorrido programado $32.000; guianza personalizada $225.000; póliza $9.000.",
}
policy_by["POL_GUIAS_2026"] = {
    "code": "POL_GUIAS_2026",
    "appliesTo": "GUIDE",
    "rule": "Tarifas de guianza 2025 ($190k–$250k) son HISTÓRICAS. No cotizar guianza 2026 sin fuente confirmada 2026.",
}
policy_by["POL_CANOPY"] = {
    "code": "POL_CANOPY",
    "appliesTo": "CANOPY_EXTREMO_EN_EL_QUINDIO",
    "rule": "Proveedor 2026: Bosque del Samán Alcalá COP 45.000/pax (imagen). También Caracolies. Comisión típica 10%. Depende del clima. No usar costo proveedor como precio de venta del tour privado.",
}
meta["policies"] = list(policy_by.values())
meta["pendingReviews"] = [
    "Caféina: asociar exactamente $100.000 y $160.000 con el producto correspondiente",
    "Finca La Alejandra: mantener relación exacta adulto/niño por producto (Agencias 2026)",
    "Finca El Ocaso: no aplicar incremento de chat hasta valor definitivo",
    "Finca Evelyza: diferenciar comisión $10.000 confirmada de comentarios de aumento",
    "Guías: obtener tarifas 2026 (hoy solo evidencia 2025)",
    "Jeep Julio César: confirmar incremento (solo audio/chat)",
    "Rural Cocina: confirmar tarifa definitiva 2026",
    "Cualquier imagen/audio sin precio inequívoco debe quedar pendiente, no inferido",
    "Separar PRIVATE/SHARED/B2B/B2C/NET/COMMISSIONABLE/PUBLIC en cotizador",
]

existing_codes = {p["code"] for p in prods["products"]}
if "CAFE_LA_MORELIA_CATACION_AGENCIAS" not in existing_codes:
    prods["products"].append(
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
        }
    )

if "ENTRADA_BOSQUE_DE_PALMAS_EAS" not in existing_codes:
    prods["products"].append(
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
        }
    )

meta["counts"] = {
    "products": len(prods["products"]),
    "providers": len(providers_list),
}

for dest in [catalog, docs_cat]:
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "proveedores.json").write_text(
        json.dumps(provs_out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (dest / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (dest / "productos.json").write_text(
        json.dumps(prods, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

src_docx = Path(r"C:\Users\07sam\Downloads\Tarifas_y_Proveedores_2026_SIG.docx")
if src_docx.exists():
    shutil.copy2(src_docx, base / "documentos" / "Tarifas_y_Proveedores_2026_SIG.docx")

# cleanup extract helper
extract = base / "documentos" / "_tarifas_extract.txt"
if extract.exists():
    extract.unlink()

print(f"providers total={len(providers_list)} updated≈{updated} added={added}")
print(f"products total={len(prods['products'])}")
print("meta version", meta["version"])
