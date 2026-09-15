/** Paquetes rápidos alineados al catálogo ai/catalogo (tarifas 2026, escala 2 pax). */

import { emptyQuoteItem, newItemId, recalcItem, type QuoteSheetItem } from './quote-sheet.model';

export interface QuotePackagePreset {
  id: string;
  label: string;
  blurb: string;
  code?: string;
  modality?: string;
  items: Array<Partial<QuoteSheetItem> & { description: string }>;
  includes?: string;
  excludes?: string;
  priceScaleByPax?: Record<string, number>;
}

export const QUOTE_PACKAGE_PRESETS: QuotePackagePreset[] = [
  {
    id: 'cocora',
    label: 'Valle de Cócora',
    code: 'COCORA',
    modality: 'Privado',
    blurb: 'Tarifa catálogo · 2 pax',
    includes: 'Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.',
    excludes: 'Almuerzo (salvo que el paquete lo indique), propinas, souvenirs y traslados fuera del itinerario.',
    priceScaleByPax: { '1': 682000, '2': 405000, '3': 357000, '4': 305000, '5': 273000, '6': 252000 },
    items: [
      {
        description:
          'Valle de Cócora\nModalidad privado · 2 personas · Tarifa catálogo EAS\nIncluye: Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.',
        quantity: 2,
        unit: 'pax',
        unitPrice: 405000
      }
    ]
  },
  {
    id: 'acaime',
    label: 'Acaime',
    code: 'ACAIME',
    modality: 'Privado',
    blurb: 'Trekking RN · tarifa catálogo',
    includes: 'Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.',
    excludes: 'Almuerzo (salvo que el paquete lo indique), propinas, souvenirs y traslados fuera del itinerario.',
    priceScaleByPax: { '1': 611000, '2': 357000, '3': 312000, '4': 263000, '5': 248000, '6': 227000 },
    items: [
      {
        description:
          'Tour Acaime / Trekking RN Acaime\nModalidad privado · 2 personas · Tarifa catálogo EAS',
        quantity: 2,
        unit: 'pax',
        unitPrice: 357000
      }
    ]
  },
  {
    id: 'aves-cafe',
    label: 'Aves y café',
    code: 'RUTA_AVES_Y_CAFE',
    modality: 'Privado',
    blurb: 'Avistamiento + finca · catálogo',
    includes: 'Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.',
    excludes: 'Almuerzo (salvo que el paquete lo indique), propinas, souvenirs y traslados fuera del itinerario.',
    priceScaleByPax: { '1': 532000, '2': 341000, '3': 325000, '4': 287000, '5': 263000 },
    items: [
      {
        description:
          'Ruta Aves y Café\nModalidad privado · 2 personas · Tarifa catálogo EAS\nIncluye: Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.',
        quantity: 2,
        unit: 'pax',
        unitPrice: 341000
      }
    ]
  },
  {
    id: 'cafe',
    label: 'Café de origen',
    code: 'CAFE',
    modality: 'Compartido',
    blurb: 'Finca · tarifa catálogo',
    includes: 'Guía especializado Escuela Aves, logística del recorrido, hidratación y seguro de viaje.',
    excludes: 'Almuerzo (salvo que el paquete lo indique), propinas, souvenirs y traslados fuera del itinerario.',
    priceScaleByPax: { '1': 192000, '2': 124000, '3': 111000, '4': 111000, '5': 111000, '6': 111000 },
    items: [
      {
        description:
          'Tour / Finca Café\nModalidad compartido · 2 personas · Tarifa catálogo EAS',
        quantity: 2,
        unit: 'pax',
        unitPrice: 124000
      }
    ]
  },
  {
    id: 'rafting',
    label: 'Rafting',
    code: 'RAFTING_EN_EL_EJE_CAFETERO',
    modality: 'Privado',
    blurb: 'Eje Cafetero · catálogo',
    includes: 'Operación con proveedor aliado, logística básica del tour y acompañamiento Escuela Aves.',
    excludes: 'Almuerzo (salvo que el paquete lo indique), propinas, souvenirs y traslados fuera del itinerario.',
    priceScaleByPax: { '1': 705000, '2': 429000, '3': 336000, '4': 368000, '5': 329000, '6': 303000 },
    items: [
      {
        description:
          'Rafting en el Eje Cafetero\nModalidad privado · 2 personas · Tarifa catálogo EAS',
        quantity: 2,
        unit: 'pax',
        unitPrice: 429000
      }
    ]
  }
];

export function itemsFromPreset(preset: QuotePackagePreset): QuoteSheetItem[] {
  const built = preset.items.map((partial) =>
    recalcItem({
      ...emptyQuoteItem(),
      id: newItemId(),
      description: partial.description,
      quantity: partial.quantity ?? 1,
      unit: partial.unit || 'pax',
      unitPrice: partial.unitPrice ?? 0,
      discount: partial.discount ?? 0
    })
  );
  return built.length ? built : [emptyQuoteItem()];
}

export function unitFromScale(scale: Record<string, number> | undefined, people: number): number | null {
  if (!scale) {
    return null;
  }
  const key = String(Math.max(1, people));
  if (scale[key] != null) {
    return Number(scale[key]) || 0;
  }
  const keys = Object.keys(scale)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (!keys.length) {
    return null;
  }
  const capped = keys.reduce((best, n) => (n <= people ? n : best), keys[0]);
  return Number(scale[String(capped)]) || 0;
}
