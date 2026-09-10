import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AutobitsApiService } from '../../features/contabilidad/services/autobits-api.service';
import { AppConfigService } from '../services/app-config.service';
import { contabilidadInterceptor } from './contabilidad.interceptor';

describe('contabilidadInterceptor DELETE /autobits/excels', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let autobitsApi: AutobitsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([contabilidadInterceptor])),
        provideHttpClientTesting(),
        AutobitsApiService,
        { provide: AppConfigService, useValue: { apiBaseUrl: '/api/v1' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    autobitsApi = TestBed.inject(AutobitsApiService);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('purgeExcels(true) dispara exactamente 1 DELETE con confirm=true', () => {
    autobitsApi.purgeExcels(true).subscribe();

    const deletes = httpMock.match((req) => req.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].request.urlWithParams).toBe(
      '/api/v1/contabilidad/autobits/excels?confirm=true'
    );
    deletes[0].flush({ ok: true, deleted: {} });
  });

  it('no emite un segundo DELETE /excels sin confirm', () => {
    autobitsApi.purgeExcels(true).subscribe();

    const deletes = httpMock.match((req) => req.method === 'DELETE' && req.url.includes('/excels'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].request.urlWithParams.includes('confirm=true')).toBe(true);
    expect(deletes[0].request.urlWithParams).not.toBe('/api/v1/contabilidad/autobits/excels');
    expect(deletes[0].request.urlWithParams).not.toBe('/contabilidad/autobits/excels');
    deletes[0].flush({ ok: true, deleted: {} });
  });

  it('un DELETE crudo con query en la URL tampoco pierde confirm=true', () => {
    http.delete('/contabilidad/autobits/excels?confirm=true').subscribe();

    const deletes = httpMock.match(() => true);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].request.method).toBe('DELETE');
    expect(deletes[0].request.urlWithParams).toBe(
      '/api/v1/contabilidad/autobits/excels?confirm=true'
    );
    deletes[0].flush({ ok: true });
  });
});
