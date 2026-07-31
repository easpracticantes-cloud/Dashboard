# Login con Google (Gmail) — Guía de configuración

Este documento explica cómo habilitar el acceso al SIG **solo con Google**
y solo para cuentas autorizadas.

Cuentas permitidas actualmente:
- `escuelaavescomercial@gmail.com`
- `easpracticantes@gmail.com`
- `escuelaavesdesalento@gmail.com`

## 1. Crear el OAuth Client ID en Google Cloud Console

1. Entra a <https://console.cloud.google.com/> con la cuenta dueña del proyecto.
2. Crea (o selecciona) un proyecto, por ejemplo **SIG-EscuelaAvesSalento**.
3. Menú → **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo**.
   - Nombre de la app: `SIG Escuela Aves Salento`.
   - Correo de asistencia y de contacto del desarrollador.
   - En **Usuarios de prueba** agrega:
     - `escuelaavescomercial@gmail.com`
     - `easpracticantes@gmail.com`
     - `escuelaavesdesalento@gmail.com`
     mientras la app esté en modo *Testing*. (En producción puedes publicarla).
4. Menú → **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `SIG Web`.
   - **Orígenes autorizados de JavaScript** (desde dónde carga el frontend):
     - `http://localhost:5173`
     - `http://localhost:4200`
     - la URL de producción, ej. `https://sig.escuelaavessalento.com`
   - **URIs de redireccionamiento**: no son necesarias con GIS (usamos `ux_mode: popup`),
     puedes dejarlo vacío.
5. Copia el **Client ID** generado (termina en `.apps.googleusercontent.com`).

> El **Client ID** es público (va en el frontend). No expongas el *Client Secret*:
> este flujo (ID Token) no lo necesita.

## 2. Configurar el backend

Variables de entorno (archivo `.env` en la raíz, ya soportadas por `docker-compose.yml`):

```env
GOOGLE_CLIENT_ID=896582936314-7mnegqbnnnaeduahj1m4kp256q0k574g.apps.googleusercontent.com
GOOGLE_ALLOWED_EMAILS=escuelaavescomercial@gmail.com,easpracticantes@gmail.com,escuelaavesdesalento@gmail.com
GOOGLE_DEFAULT_ROLE=GERENCIA
```

Reglas de la lista blanca (`GOOGLE_ALLOWED_EMAILS`):
- Correo exacto: `escuelaavescomercial@gmail.com`
- Varios correos separados por coma
- Dominio completo (opcional): `@escuelaavessalento.com`
- **Si queda vacío, se rechazan todos los accesos por Google** (seguro por defecto).

Estas variables mapean a `app.google.*` en `application.yml`.

## 3. Configurar el frontend

Edita el Client ID en los environments de Angular:

- `frontend/src/environments/environment.ts`
- `frontend/src/environments/environment.development.ts`
- `frontend/src/environments/environment.production.ts`

```ts
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8081/api/v1',
  googleClientId: '1234567890-xxxxxxxxxxxxxxxx.apps.googleusercontent.com'
};
```

El script de Google Identity Services ya está incluido en `index.html`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

Si `googleClientId` está vacío, el botón de Google **no se muestra** y el login
por usuario/contraseña sigue funcionando igual.

## 4. Levantar el proyecto

```bash
docker compose up -d --build backend frontend
```

- Backend: <http://localhost:8081>  · Swagger: <http://localhost:8081/swagger-ui.html>
- Frontend: <http://localhost:5173>

## 5. Flujo de autenticación

1. En el login aparece el botón **"Iniciar sesión con Google"** (arriba, como en otras páginas).
2. Al hacer clic se abre el **popup de Google** para elegir el correo (`prompt=select_account`).
3. Google devuelve un Access Token; el frontend lo envía a `POST /api/v1/auth/google-login`.
4. El backend valida el token con la API de Google, exige `email_verified` y comprueba la **lista blanca**.
5. Si es válido, crea/actualiza el usuario (nombre + foto) y emite el **JWT propio del SIG**.
6. El frontend guarda el JWT y redirige al Dashboard.

## 6. Cerrar sesión

`logout()` limpia el JWT local y llama a `google.accounts.id.disableAutoSelect()`
para que Google **no reingrese automáticamente** en la siguiente visita.

## 7. Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| El botón de Google no aparece | `googleClientId` vacío | Configura el Client ID en los environments |
| `401 no autorizada` | correo fuera de la lista blanca | Agrega el correo a `GOOGLE_ALLOWED_EMAILS` |
| `Login con Google no está configurado` | falta `GOOGLE_CLIENT_ID` en backend | Define la variable y reconstruye el backend |
| `origin is not allowed` en consola | origen no registrado | Agrega la URL a *Orígenes autorizados de JavaScript* |
| `403 access_denied` | app en *Testing* y correo no es *usuario de prueba* | Agrega el correo en la pantalla de consentimiento o publica la app |
