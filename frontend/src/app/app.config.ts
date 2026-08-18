import { ApplicationConfig, APP_INITIALIZER, LOCALE_ID, inject } from '@angular/core';
import { provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideNativeDateAdapter } from '@angular/material/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { CriticalModulesPreloadStrategy } from './core/routing/critical-modules-preload.strategy';
import { AppConfigService } from './core/services/app-config.service';

registerLocaleData(localeEs);

function initAppConfig(): () => Promise<void> {
  const config = inject(AppConfigService);
  return () => config.load();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withPreloading(CriticalModulesPreloadStrategy)),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    provideNativeDateAdapter(),
    { provide: APP_INITIALIZER, multi: true, useFactory: initAppConfig },
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-icons' } }
  ]
};
