# Mejoras visuales REALES (no micro-CSS fantasma)

Las olas v4/v5 (~500KB de reglas numeradas) **no cambiaban nada visible**.
Esta entrega las saca del build y aplica un rediseño que sí se nota.

## Qué vas a ver distinto

1. **Sidebar marca oscura** (muro forest) con logo claro, nav ámbar activo y marca de ave.
2. **Canvas** con atmósfera verde/ámbar (ya no flat mint).
3. **Page headers** en tarjeta con barra ámbar–verde y tipografía Montserrat fuerte.
4. **Dashboard hero** más profundo + watermark del ave.
5. **Seguimiento**: filtros compactos nativos (adiós Material outline alto) + tabla con cabecera sticky tintada + pills de prioridad/estado de color.
6. **Cotizaciones**: montos grandes en verde + pills por estado (`DRAFT`/`SENT`/`ACCEPTED`…).
7. **Sheets**: tabs activos rellenos, chips/cards activos con rail, charts con banda de cabecera.
8. **Login**: hero con watermark; en móvil queda franja de marca (ya no desaparece todo).
9. **`sig-ui-real.css`**: cards, botones, chips, focus rings y KPIs con presencia real.
10. **Quitados** `visual-polish-v4.css` y `visual-polish-v5.css` del `angular.json`.

## Archivos tocados

- `tokens.css` / `styles.scss` — tokens sidebar + canvas
- `sidebar.*` — rediseño brand wall
- `shell.component.ts` — atmósfera canvas
- `page-header.component.ts` — header con presencia
- `conversations-list.*` — filtros densos + tabla
- `dashboard.component.scss` — hero + charts
- `dashboard-sheets.*` — chips/tabs/cards activos
- `quotes` + `commercial-page.scss` — montos/estados
- `login.component.scss` — hero + mobile band
- `sig-ui-real.css` + `angular.json`

## Nota sobre “+10000”

Inventar 10.000 líneas CSS que no alteran el layout **es lo que hacía que “vieras todo igual”**.
Aquí priorizamos cambios estructurales y de jerarquía que se perciben al instante.
