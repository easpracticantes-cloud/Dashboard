const LEGACY_PREFIXES: Array<[string, string]> = [
  ['/api/dashboard', '/contabilidad/dashboard'],
  ['/api/reports', '/contabilidad/reports'],
  ['/api/procesar', '/contabilidad/procesar'],
  ['/api/health', '/contabilidad/health'],
  ['/api/preview/', '/contabilidad/preview/'],
  ['/api/documents/', '/contabilidad/documents/'],
  ['/api/payments/', '/contabilidad/payments/'],
  ['/api/packages/', '/contabilidad/packages/'],
  ['/api/ops/', '/contabilidad/ops/'],
  ['/api/periods/', '/contabilidad/periods/'],
  ['/api/reconciliation/', '/contabilidad/reconciliation/'],
];

/**
 * Reescribe URLs del módulo Contabilidad hacia `/api/v1/contabilidad/**`.
 * Acepta rutas relativas y absolutas (HttpClient/fetch a veces absolutizan).
 */
export function rewriteContabilidadUrl(rawUrl: string, apiBaseUrl: string): string | null {
  const pathname = pathnameOf(rawUrl);
  if (!pathname) {
    return null;
  }

  let path = pathname;
  if (path.startsWith('/api/v1/contabilidad/')) {
    return withSearch(joinBase(apiBaseUrl, path.slice('/api/v1'.length)), rawUrl);
  }
  if (!isContablePath(path)) {
    return null;
  }
  for (const [from, to] of LEGACY_PREFIXES) {
    if (path.startsWith(from)) {
      path = to + path.slice(from.length);
      break;
    }
  }
  return withSearch(joinBase(apiBaseUrl, path), rawUrl);
}

export function isContablePath(pathname: string): boolean {
  return (
    pathname.startsWith('/contabilidad/') ||
    pathname.startsWith('/api/dashboard') ||
    pathname.startsWith('/api/reports') ||
    pathname.startsWith('/api/procesar') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/preview/') ||
    pathname.startsWith('/api/documents/') ||
    pathname.startsWith('/api/payments/') ||
    pathname.startsWith('/api/packages/') ||
    pathname.startsWith('/api/ops/') ||
    pathname.startsWith('/api/periods/') ||
    pathname.startsWith('/api/reconciliation/') ||
    pathname.startsWith('/api/v1/contabilidad/')
  );
}

function pathnameOf(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed.split('?')[0];
    }
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return path.split('?')[0];
}

function searchOf(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).search;
    } catch {
      const q = trimmed.indexOf('?');
      return q >= 0 ? trimmed.slice(q) : '';
    }
  }
  const q = trimmed.indexOf('?');
  return q >= 0 ? trimmed.slice(q) : '';
}

function withSearch(rewritten: string, rawUrl: string): string {
  const search = searchOf(rawUrl);
  if (!search) {
    return rewritten;
  }
  return rewritten.includes('?') ? rewritten : `${rewritten}${search}`;
}

function joinBase(apiBaseUrl: string, path: string): string {
  const base = (apiBaseUrl || '/api/v1').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
