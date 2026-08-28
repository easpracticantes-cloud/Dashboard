import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppConfigService } from '../services/app-config.service';

/**
 * Reescribe rutas del módulo Contabilidad hacia el API del SIG
 * (`/api/v1/contabilidad/...`), que a su vez hace de proxy al servicio FastAPI.
 */
export const contabilidadInterceptor: HttpInterceptorFn = (req, next) => {
  const url = req.url;
  const isContable =
    url.startsWith('/contabilidad/') ||
    url.startsWith('/api/dashboard') ||
    url.startsWith('/api/reports') ||
    url.startsWith('/api/procesar') ||
    url.startsWith('/api/health') ||
    url.startsWith('/api/preview/');

  if (!isContable) {
    return next(req);
  }

  const config = inject(AppConfigService);
  let path = url;
  if (path.startsWith('/api/dashboard')) {
    path = path.replace('/api/dashboard', '/contabilidad/dashboard');
  } else if (path.startsWith('/api/reports')) {
    path = path.replace('/api/reports', '/contabilidad/reports');
  } else if (path.startsWith('/api/procesar')) {
    path = path.replace('/api/procesar', '/contabilidad/procesar');
  } else if (path.startsWith('/api/health')) {
    path = path.replace('/api/health', '/contabilidad/health');
  } else if (path.startsWith('/api/preview/')) {
    path = path.replace('/api/preview/', '/contabilidad/preview/');
  }

  return next(req.clone({ url: `${config.apiBaseUrl}${path}` }));
};
