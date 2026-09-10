import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppConfigService } from '../services/app-config.service';
import { rewriteContabilidadUrl } from './contabilidad-url';

/**
 * Reescribe rutas del módulo Contabilidad hacia el API del SIG
 * (`/api/v1/contabilidad/...`), que a su vez hace de proxy al servicio FastAPI.
 */
export const contabilidadInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(AppConfigService);
  const rewritten = rewriteContabilidadUrl(req.url, config.apiBaseUrl);
  if (!rewritten) {
    return next(req);
  }
  return next(req.clone({ url: rewritten }));
};
