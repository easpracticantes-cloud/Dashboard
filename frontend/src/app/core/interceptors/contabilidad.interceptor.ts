import { HttpInterceptorFn, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppConfigService } from '../services/app-config.service';
import { rewriteContabilidadUrl } from './contabilidad-url';

/**
 * Reescribe rutas del módulo Contabilidad hacia el API del SIG
 * (`/api/v1/contabilidad/...`), que a su vez hace de proxy al servicio FastAPI.
 *
 * Usa `urlWithParams` y vacía `params` al clonar para no perder ni duplicar
 * query strings (`confirm=true` en DELETE /autobits/excels).
 */
export const contabilidadInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(AppConfigService);
  const rewritten = rewriteContabilidadUrl(req.urlWithParams, config.apiBaseUrl);
  if (!rewritten) {
    return next(req);
  }
  return next(req.clone({ url: rewritten, params: new HttpParams() }));
};
