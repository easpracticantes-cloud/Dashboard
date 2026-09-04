# Migración Render → Oracle Cloud

## Principio

| Qué | Cómo se migra |
|-----|----------------|
| **Código** | Git clone / ZIP / `git pull` en la VM Oracle |
| **Datos PostgreSQL (SIG)** | `pg_dump` en Render → `psql` restore en Oracle. **No** vienen en el ZIP |
| **Datos Contabilidad SQLite + storage** | Copiar `contable.db` + carpeta `storage` desde disco Render / backup | 
| **Secretos** | Reescribir en `.env` Oracle (no copiar dashboard Render a ciegas) |
| **DNS / OAuth / Sheets** | Actualizar orígenes Google; Sheets URL suele mantenerse |

Render deja de ser producción. El blueprint quedó en `docs/historical/render.yaml`.

---

## 1. Inventario de lo que había en Render

Servicios típicos del proyecto:

1. **dashboard-frontend** — Static Site Angular (`onrender.com`)
2. **dashboard-7spt** — Spring Boot + PostgreSQL managed Render
3. **sig-contabilidad** — FastAPI + disco persistente SQLite/storage

Referencias de código/config que apuntaban a Render (ya neutralizadas para prod Oracle):

- `frontend` `apiBaseUrl` → ahora `/api/v1`
- `CORS` / `*.onrender.com`
- `CONTABLE_API_BASE=https://sig-contabilidad.onrender.com`
- `render.yaml` (movido a histórico)

---

## 2. Preparar Oracle (código)

1. Crear VM, instalar Docker (ver `ORACLE_DEPLOYMENT.md`).
2. Clonar repo o subir ZIP **sin** esperar que traiga DBs.
3. `cp .env.example .env` y completar.
4. `./scripts/oracle-deploy.sh` → app vacía o con seed según `SEED_ENABLED`.

Hasta aquí solo hay **código + volúmenes nuevos vacíos**.

---

## 3. Migrar PostgreSQL (SIG)

### 3.1 Export desde Render

En el dashboard Render → PostgreSQL → External Connection, o Shell del backend:

```bash
# Ejemplo con URL externa Render (sustituye la tuya; no la subas a git)
pg_dump "$RENDER_DATABASE_URL" --no-owner --no-acl | gzip > postgres-render.sql.gz
```

Si solo tienes el servicio web Java, usa la connection string de la DB adjunta.

### 3.2 Import en Oracle

Con Compose ya arriba:

```bash
gunzip -c postgres-render.sql.gz | \
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Notas:

- Flyway ya habrá creado schema `sig` al arrancar el backend. Si hay conflictos de versión, alinea `flyway_schema_history` o restaura sobre DB limpia **después** de backup vacío.
- `SEED_ENABLED=false` en producción para no pisar datos migrados.

### 3.3 Verificar

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt sig.*'
```

---

## 4. Migrar Contabilidad (SQLite + storage)

### 4.1 Desde Render

En el disco del servicio `sig-contabilidad` (SSH/shell Render o descarga de disco):

- `/app/data/contable.db` (o path del volumen)
- `/app/storage/**`

Empaquetar:

```bash
tar -czf contabilidad-render.tar.gz -C /app data storage
```

### 4.2 Hacia Oracle

Con el contenedor parado (volúmenes intactos):

```bash
docker compose stop contabilidad
# Copiar al volumen (ajusta nombre de volumen: docker volume ls)
docker run --rm \
  -v "$(pwd)/contabilidad-render.tar.gz:/backup.tar.gz:ro" \
  -v PROJECT_contabilidad_data:/app/data \
  -v PROJECT_contabilidad_storage:/app/storage \
  alpine sh -c 'cd /app && tar -xzf /backup.tar.gz'
docker compose start contabilidad
```

`PROJECT` = prefijo del directorio Compose (suele ser el nombre de carpeta).

### 4.3 Verificar

```bash
docker compose exec contabilidad ls -la /app/data /app/storage
docker compose exec contabilidad python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8787/api/health').read())"
```

Desde el navegador: Contabilidad vía SIG (`/api/v1/contabilidad/...`) con JWT.

---

## 5. Variables de entorno (mapa)

| Render (antes) | Oracle `.env` |
|----------------|---------------|
| `DATABASE_URL` JDBC Render | `DB_URL=jdbc:postgresql://db:5432/...` (Compose) |
| `CORS_ALLOWED_ORIGINS=*.onrender.com` | `https://tu-dominio` |
| `CONTABLE_API_BASE=https://sig-contabilidad.onrender.com` | `http://contabilidad:8787` |
| `GEMINI_API_KEY` | igual |
| `GOOGLE_CLIENT_ID` | igual + actualizar origins |
| `PORT` | gestionado por Compose |

---

## 6. Google OAuth / Sheets

1. Añadir origen JS `https://tu-dominio` en Google Cloud Console.
2. Quitar origins `*.onrender.com` cuando apagues Render.
3. `GOOGLE_SHEETS_WEBAPP_URL` **no** es Render: suele seguir igual (Apps Script).

---

## 7. DNS cutover

1. Probar Oracle por IP/hosts.
2. Bajar TTL DNS.
3. Apuntar dominio a IP Oracle.
4. Certbot HTTPS.
5. Apagar servicios Render (no borrar discos hasta backup verificado 7–14 días).

---

## 8. Checklist final

- [ ] App responde en `https://dominio`
- [ ] Login Google OK
- [ ] CRM/conversaciones con datos migrados
- [ ] Contabilidad lista documentos/archivos
- [ ] Sheets sync OK
- [ ] Backups cron en Oracle
- [ ] Render suspendido / sin tráfico
- [ ] Ningún `onrender.com` en `.env` ni en `runtime-config.json`

---

## 9. Problemas frecuentes

- **Restore Flyway conflict:** no mezclar seed + dump sin plan; preferir dump completo.
- **Frontend sigue llamando Render:** rebuild imagen frontend (`apiBaseUrl=/api/v1`) y hard refresh.
- **Contabilidad 502:** `CONTABLE_API_BASE` mal (sigue URL onrender) o contenedor down.
- **Datos “perdidos” tras update:** alguien usó `docker compose down -v` — recuperar backup.
