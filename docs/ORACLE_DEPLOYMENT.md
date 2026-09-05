# Despliegue SIG en Oracle Cloud

**Producción = Docker Compose en una VM Oracle.**  
Render ya no es dependencia de producción (`docs/historical/render.yaml` es solo archivo).

## 1. Arquitectura

```text
Internet
   |
   v
[Opcional] Nginx host + Certbot (443/80)
   |
   v
Docker: frontend (Nginx :80)  ← ÚNICO puerto publicado por Compose
   |
   +-- /        → Angular SPA
   +-- /api/    → backend:8080 (Spring Boot)
                    |
                    +-- db:5432 (PostgreSQL, volumen)
                    `-- contabilidad:8787 (FastAPI, volúmenes SQLite+storage)
```

| Servicio | Público | Puerto Compose |
|----------|---------|----------------|
| frontend (Nginx) | Sí | `PUBLIC_HTTP_PORT` → 80 |
| backend | No | solo red `sig_net` |
| contabilidad | No | solo red `sig_net` |
| PostgreSQL | No | solo red `sig_net` |

## 2. Requisitos Oracle

- VM Linux (Ubuntu 22.04/24.04 recomendado)
- Acceso SSH
- Dominio DNS → IP pública (recomendado para HTTPS y Google OAuth)
- Firewall Oracle Cloud Security List / NSG: **solo 22, 80, 443**
- 2+ vCPU, 4–8 GB RAM (IA + OCR)

## 3. Docker e instalación

```bash
# Ubuntu ejemplo
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# cerrar sesión SSH y volver
docker --version
docker compose version
```

## 4. Estructura en el servidor

```text
/opt/sig/          # o $HOME/sig
  ├── backend/
  ├── frontend/
  ├── contabilidad-service/
  ├── docker-compose.yml
  ├── docker-compose.dev.yml   # NO usar en prod
  ├── .env                     # secretos (no en git)
  ├── .env.example
  ├── scripts/
  └── docs/
```

## 5. Crear `.env`

```bash
cp .env.example .env
nano .env
```

Obligatorio en producción:

- `POSTGRES_PASSWORD` fuerte
- `JWT_SECRET` ≥ 32 chars
- `CORS_ALLOWED_ORIGINS=https://tu-dominio.com`
- `GOOGLE_CLIENT_ID` / `GOOGLE_ALLOWED_EMAILS`
- `ANTHROPIC_API_KEY` y `ANTHROPIC_WORKSPACE_ID`
- `CONTABLE_API_BASE=http://contabilidad:8787`
- `SEED_ENABLED=false` (salvo primer bootstrap consciente)
- `PUBLIC_HTTP_PORT=80`

## 6. Firewall Oracle

Security List / NSG ingress:

| Puerto | Uso |
|--------|-----|
| 22 | SSH |
| 80 | HTTP (Certbot / app) |
| 443 | HTTPS |

**No abrir** 5432, 8080, 8787 a Internet.

## 7. Levantar

```bash
chmod +x scripts/*.sh
./scripts/oracle-deploy.sh
# equivalente:
# docker compose build && docker compose up -d
```

## 8. Comprobar

```bash
docker compose ps
curl -I http://127.0.0.1/
curl -sS http://127.0.0.1/api/v1/  # puede 401/404; no 502
docker compose exec backend sh -c 'bash -c "exec 3<>/dev/tcp/contabilidad/8787"' && echo contabilidad_ok
docker compose exec db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose logs -f --tail=100 backend
```

Health Spring (si actuator expuesto vía nginx):

```bash
curl -sS http://127.0.0.1/actuator/health
```

Contabilidad (solo red interna):

```bash
docker compose exec backend python -c '' 2>/dev/null || true
# desde el host (sin publicar puerto) vía docker:
docker compose exec contabilidad python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8787/api/health').read())"
```

## 9. Qué Nginx es el público

**Por defecto:** el Nginx **del contenedor `frontend`** escucha en el puerto host `PUBLIC_HTTP_PORT` (80).

**Si instalas Nginx en el host Oracle** (recomendado con Certbot):

1. Cambia en `.env`: `PUBLIC_HTTP_PORT=8080` (Compose publica 8080→80 contenedor).
2. Host Nginx hace proxy `80/443` → `http://127.0.0.1:8080`.
3. **No** dejes dos procesos compitiendo por el 80.

Plantilla host (`/etc/nginx/sites-available/sig`):

```nginx
server {
  listen 80;
  server_name tu-dominio.com;
  client_max_body_size 25m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
  }
}
```

## 10. HTTPS (Let's Encrypt)

No se automatiza en el repo. En el host:

```bash
sudo apt install -y certbot python3-certbot-nginx
# con Nginx host (recomendado):
sudo certbot --nginx -d tu-dominio.com
```

Si solo usas el contenedor en :80, puedes usar un reverse proxy host + Certbot, o Caddy.  
Puertos públicos finales: **80 y 443**.

## 11. Dominio

1. A/AAAA → IP Oracle  
2. `CORS_ALLOWED_ORIGINS=https://tu-dominio.com`  
3. Rebuild/recreate backend: `docker compose up -d backend`  
4. Google OAuth origins (siguiente sección)

## 12. Google OAuth

En [Google Cloud Console](https://console.cloud.google.com/) → Credenciales → Client ID web:

**Authorized JavaScript origins** (añadir, no inventar):

- `https://tu-dominio.com`
- (pruebas) `http://IP_PUBLICA` solo temporal

El Client ID del código puede mantenerse; **sí o sí** hay que actualizar origins al dominio Oracle.  
Redirect URIs: solo si usas flujo redirect; el login actual es GIS (token ID) — origins JS son lo crítico.

## 13. Persistencia (NO confundir código con datos)

| Dato | Dónde | Volumen Docker |
|------|--------|----------------|
| CRM, users, conversaciones, AI usage… | PostgreSQL | `sig_postgres_data` → `/var/lib/postgresql/data` |
| Facturas metadata Contabilidad | SQLite | `contabilidad_data` → `/app/data/contable.db` |
| Archivos OCR/uploads | FS | `contabilidad_storage` → `/app/storage` |

**Copiar el ZIP/repo no migra estos datos.**

## 14. Backups

```bash
./scripts/backup-postgres.sh
./scripts/backup-contabilidad.sh
# salida en ./backups/
```

Programar cron diario. Guardar fuera de la VM (Object Storage).

## 15. Restaurar

### PostgreSQL

```bash
gunzip -c backups/postgres-sig-XXXX.sql.gz | \
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

(En restore completo puede hacer falta DB vacía; **no** uses `down -v` sin backup verificado.)

### Contabilidad

```bash
# Detener solo el servicio (volúmenes siguen):
docker compose stop contabilidad
# Extraer tar en un tmp y copiar al volumen — ejemplo:
docker compose run --rm -v sig_contabilidad_data:/app/data -v sig_contabilidad_storage:/app/storage \
  -v "$PWD/backups:/backups" alpine sh -c 'cd /app && tar -xzf /backups/contabilidad-XXXX.tar.gz'
docker compose start contabilidad
```

Ajusta nombres de volúmenes con `docker volume ls`.

## 16. Actualizar app sin perder datos

```bash
./scripts/oracle-update.sh
# NUNCA: docker compose down -v
```

## 17. Troubleshooting

| Síntoma | Qué mirar |
|---------|-----------|
| 502 en `/api/` | `docker compose logs backend` / `contabilidad` |
| Login Google blocked | Origins en Cloud Console + HTTPS |
| CORS error | `CORS_ALLOWED_ORIGINS` exacto (https, sin slash final) |
| Contabilidad vacía | Volumen `contabilidad_data` / restore SQLite |
| DB vacía tras recreate | ¿Usaste `-v`? Restaurar dump |
| Puerto 80 ocupado | Host Nginx vs `PUBLIC_HTTP_PORT` |

## 18. Desarrollo local (opcional)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Expone Postgres/backend/contabilidad en el host. **No** en Oracle prod.
