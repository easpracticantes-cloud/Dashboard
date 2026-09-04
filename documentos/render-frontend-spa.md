# Frontend SPA routing — histórico Render

> **Producción actual:** Nginx del contenedor `frontend` (`try_files` en `frontend/nginx.conf`).  
> Ver [`docs/ORACLE_DEPLOYMENT.md`](../docs/ORACLE_DEPLOYMENT.md).  
> `render.yaml` está en `docs/historical/`.

## Problema (Render Static Site)
Al recargar `/app/dashboard` (F5), Render devolvía **Not Found** porque buscaba un archivo físico. Angular Router necesita que **todas** las rutas sirvan `index.html`.

## Solución en este repo

1. **Histórico `docs/historical/render.yaml`**: rewrite oficial de Render  
   `/*` → `/index.html`
2. **`frontend/public/_redirects`**:  
   `/*    /index.html   200`  
   se copia al publish dir en el build
3. **`angular.json`**: assets incluyen `public/`
4. **`package.json`**: `build` corre `copy-spa-fallback.js` tras `ng build`

## Configuración del Static Site en Render Dashboard

| Campo | Valor |
|--------|--------|
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist/eas-sig-frontend/browser` |

### Rewrite (obligatorio si no usas Blueprint)

**Redirects/Rewrites** → Add:

| Source | Destination | Action |
|--------|-------------|--------|
| `/*` | `/index.html` | **Rewrite** |

Sin esta regla (o sin Blueprint con `routes`), F5 en rutas profundas seguirá fallando.

## Verificar tras deploy

1. Abrir `/app/dashboard`
2. Pulsar F5 → debe cargar la app, no "Not Found"
3. Igual con `/app/conversations`, `/app/analytics`, `/app/settings`
