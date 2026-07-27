# README — Endpoints SIG

Base URL: `http://localhost:8081/api/v1`  
Auth: `Authorization: Bearer <token>` (excepto login / forgot / reset)

## Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | `{ username, password, rememberMe }` → JWT + user |
| POST | `/auth/google-login` | `{ idToken }` (Google ID Token) → valida lista blanca y devuelve JWT + user |
| POST | `/auth/refresh` | `{ refreshToken }` → nuevo JWT |
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ token, newPassword }` |
| GET | `/auth/me` | Usuario autenticado |

### `POST /auth/google-login`
Login con Gmail. El frontend abre un **popup de Google** para elegir el correo
(como en otras páginas) y envía el access token al backend.

**Request** (uno de los dos campos):
```json
{ "accessToken": "<token del popup OAuth de Google>" }
```
o
```json
{ "idToken": "<Google ID Token / credential GIS>" }
```

**Response 200** (igual que `/auth/login`)
```json
{
  "token": "<jwt>",
  "refreshToken": "<refresh>",
  "tokenType": "Bearer",
  "expiresInMinutes": 120,
  "user": { "id": "...", "username": "jefa", "email": "jefa@gmail.com", "fullName": "...", "avatarUrl": "https://...", "role": "GERENCIA", "active": true }
}
```

**Errores**
- `401` token inválido/expirado, correo no verificado, o correo **fuera de la lista blanca**.

**Reglas de seguridad (backend)**
- Verifica firma, expiración y `audience` = `GOOGLE_CLIENT_ID`.
- Exige `email_verified = true`.
- Solo permite correos/dominios de `GOOGLE_ALLOWED_EMAILS` (ej: `jefa@gmail.com,@escuelaavessalento.com`).
- Crea el usuario la primera vez con rol `GOOGLE_DEFAULT_ROLE` (por defecto `GERENCIA`) y guarda nombre + foto de Google.

Configuración: ver [`documentos/google-login-setup.md`](documentos/google-login-setup.md).

## Dashboard
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dashboard/overview` | KPIs + conversaciones recientes |
| GET | `/dashboard/analytics` | Series para gráficas |

## Clientes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/clients` | Listado paginado |
| GET | `/clients/{id}` | Detalle |
| POST | `/clients` | Crear |
| PUT | `/clients/{id}` | Actualizar |
| DELETE | `/clients/{id}` | Eliminar |

## Conversaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/conversations` | Listado paginado |
| GET | `/conversations/{id}` | Detalle |
| POST | `/conversations` | Crear |
| PATCH | `/conversations/{id}/assign` | Asignar asesor |
| PATCH | `/conversations/{id}/status` | Cambiar estado |
| PATCH | `/conversations/{id}/priority` | Cambiar prioridad |
| GET | `/conversations/{id}/messages` | Mensajes |
| POST | `/conversations/{id}/messages` | Enviar mensaje `{ body }` |

## Notificaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/notifications` | Listado |
| PATCH | `/notifications/{id}/read` | Marcar leída |

## Usuarios / Perfil / Configuración
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/PUT/DELETE | `/users` | CRUD usuarios (admin) |
| GET/PUT | `/profile` | Perfil del usuario |
| GET/PUT | `/settings` | Configuración del sistema |

## Reportes e integraciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reports/conversations` | Resumen |
| GET | `/reports/conversations/export/csv` | Export CSV |
| GET | `/reports/conversations/export/pdf` | Export PDF (stub) |
| GET | `/integrations/status` | Estado de puertos de integración |

Swagger: http://localhost:8081/swagger-ui.html
