# Despliegue del frontend en GitHub Pages

URL esperada: **https://easpracticantes-cloud.github.io/Dashboard/**

El frontend Angular se publica automáticamente en la rama `gh-pages` con el workflow
`.github/workflows/deploy-github-pages.yml` (push a `main` o ejecución manual).

## Qué hace el workflow

1. Instala dependencias en `frontend/`
2. Ejecuta `ng build --configuration=production --base-href=/Dashboard/`
3. Copia `frontend/dist/eas-sig-frontend/browser/` a la raíz de `gh-pages`
4. Crea `404.html` (igual que `index.html`) para rutas SPA
5. Crea `.nojekyll`

## Configuración en GitHub (obligatorio una vez)

1. Entra a: https://github.com/easpracticantes-cloud/Dashboard/settings/pages
2. En **Build and deployment → Source** elige **Deploy from a branch**
3. En **Branch** selecciona:
   - Branch: `gh-pages`
   - Folder: `/ (root)`
4. Pulsa **Save**
5. Espera 1–2 minutos y abre: https://easpracticantes-cloud.github.io/Dashboard/

Si la rama `gh-pages` aún no existe:

1. Ve a **Actions** → workflow **Deploy GitHub Pages**
2. Pulsa **Run workflow** (rama `main`)
3. Cuando termine en verde, vuelve a Settings → Pages y elige `gh-pages` / `(root)`

## Notas importantes

- **No uses Vercel** para este proyecto. El front en Pages es estático.
- La API (`/api/v1`) **no** corre en GitHub Pages. Para login/datos reales necesitas un backend público (Docker/VPS) y actualizar `frontend/src/environments/environment.production.ts` → `apiBaseUrl`.
- En Google Cloud Console (OAuth), agrega como origen autorizado:
  - `https://easpracticantes-cloud.github.io`
  - Y como redirect URI (si aplica): `https://easpracticantes-cloud.github.io/Dashboard/`

## Build local (igual que CI)

```bash
cd frontend
npm ci
npx ng build --configuration=production --base-href=/Dashboard/
```

Salida: `frontend/dist/eas-sig-frontend/browser/`
