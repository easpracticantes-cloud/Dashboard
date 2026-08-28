# Despliegue Contabilidad en Render

Para que **Contabilidad** funcione en la página pública (no solo local):

## Checklist rápido

1. **Crear Web Service** `sig-contabilidad` (Docker, carpeta `contabilidad-service`)
2. En el backend Java `dashboard-7spt` → Environment:
   ```
   CONTABLE_API_BASE=https://sig-contabilidad.onrender.com
   ```
   (usa la URL real que te dé Render)
3. Redeploy backend + frontend (el front ya tiene el menú Contabilidad)

Detalle completo: [`contabilidad_integracion.md`](./contabilidad_integracion.md)
