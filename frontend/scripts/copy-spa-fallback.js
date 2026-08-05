/**
 * Copia _redirects al root publicado (browser/) por si el asset pipeline
 * no lo incluye. En Render Linux el build usa este script tras `ng build`.
 */
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', 'public', '_redirects');
const destDir = join(__dirname, '..', 'dist', 'eas-sig-frontend', 'browser');
const dest = join(destDir, '_redirects');

if (!existsSync(src)) {
  console.warn('[spa-fallback] public/_redirects no encontrado');
  process.exit(0);
}
if (!existsSync(destDir)) {
  console.warn('[spa-fallback] dist/eas-sig-frontend/browser no existe; ¿falló el build?');
  process.exit(1);
}
copyFileSync(src, dest);
console.log('[spa-fallback] Copiado _redirects →', dest);
