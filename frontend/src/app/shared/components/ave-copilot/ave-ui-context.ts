export interface AveEntityFocus {
  type: string;
  allowed: Record<string, string>;
}

interface AveUiContextPayload {
  module?: string;
  role?: string;
  entity?: string;
  allowedContext?: Record<string, string>;
  hits?: Array<{ id: string; label: string }>;
}

const ALLOWED_KEYS = ['cliente', 'celular', 'fecha', 'hoja', 'semaforo'] as const;

/** JSON compacto y con allowlist. No incluye notas, objeciones ni la página. */
export function compactAveUiContext(input: {
  module?: string;
  role?: string;
  entity?: AveEntityFocus | null;
  hits?: Array<{ id?: string; label?: string }>;
}): string {
  const out: AveUiContextPayload = {};
  const module = (input.module || '').trim().slice(0, 40);
  if (module) out.module = module;
  const role = (input.role || '').trim().slice(0, 32);
  if (role) out.role = role;
  if (input.entity?.type) {
    out.entity = String(input.entity.type).trim().slice(0, 24);
    const allowed: Record<string, string> = {};
    for (const key of ALLOWED_KEYS) {
      const value = (input.entity.allowed?.[key] || '').trim().slice(0, 80);
      if (value) allowed[key] = value;
    }
    if (Object.keys(allowed).length) out.allowedContext = allowed;
  }
  if (input.hits?.length) {
    out.hits = input.hits.slice(0, 5).map((h) => ({
      id: String(h.id || '').trim().slice(0, 40),
      label: String(h.label || '').trim().slice(0, 60)
    })).filter((h) => h.label || h.id);
  }
  const json = JSON.stringify(out);
  return json.length > 600 ? json.slice(0, 600) : json;
}
