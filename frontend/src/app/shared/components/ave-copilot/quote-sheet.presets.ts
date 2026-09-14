/** Paquetes rápidos para armar cotizaciones en Ave. */

import { emptyQuoteItem, newItemId, recalcItem, type QuoteSheetItem } from './quote-sheet.model';

export interface QuotePackagePreset {
  id: string;
  label: string;
  blurb: string;
  items: Array<Partial<QuoteSheetItem> & { description: string }>;
  includes?: string;
  excludes?: string;
}

export const QUOTE_PACKAGE_PRESETS: QuotePackagePreset[] = [
  {
    id: 'cocora',
    label: 'Valle de Cocora',
    blurb: 'Palmas de cera + naturaleza',
    includes: 'Guía local, seguro de viaje, hidratación',
    excludes: 'Almuerzo, transporte desde Pereira',
    items: [
      {
        description: 'Tour Valle de Cocora\nCaminata entre palmas de cera, miradores y café de origen.',
        quantity: 2,
        unit: 'pax',
        unitPrice: 180000
      }
    ]
  },
  {
    id: 'birding',
    label: 'Avistamiento amanecer',
    blurb: 'Birding con guía experto',
    includes: 'Guía ornitólogo, binoculares, refrigerio',
    excludes: 'Equipo fotográfico profesional',
    items: [
      {
        description: 'Avistamiento de aves al amanecer\nSalida temprana por senderos de Salento con guía especializado.',
        quantity: 2,
        unit: 'pax',
        unitPrice: 220000
      }
    ]
  },
  {
    id: 'fullday',
    label: 'Día completo Salento',
    blurb: 'Cocora + pueblo + café',
    includes: 'Guía, entradas básicas, almuerzo típico',
    excludes: 'Souvenirs y consumos extras',
    items: [
      {
        description: 'Experiencia día completo en Salento\nCocora + recorrido por el pueblo + degustación de café.',
        quantity: 2,
        unit: 'pax',
        unitPrice: 320000
      }
    ]
  },
  {
    id: 'private',
    label: 'Privado / a medida',
    blurb: 'Servicio exclusivo',
    includes: 'Guía privado, logística a medida',
    excludes: 'Según acuerdo comercial',
    items: [
      {
        description: 'Experiencia privada Escuela Aves\nItinerario personalizado según interés del grupo.',
        quantity: 1,
        unit: 'grupo',
        unitPrice: 650000
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
