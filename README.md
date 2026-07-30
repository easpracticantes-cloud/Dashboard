# SIG — Sistema Inteligente de Gestión
### Escuela Aves Salento

Plataforma empresarial moderna para administrar conversaciones de WhatsApp, clientes, analítica, reportes y operaciones del equipo de **Escuela Aves Salento**.

Diseño premium inspirado en la esencia natural de la marca (verdes, blancos, tonos orgánicos), reinterpretada como una consola SaaS de nivel comercial.

---

## Arquitectura

```
┌─────────────────────┐     REST / JWT      ┌──────────────────────────────┐
│  Angular 21 +       │◄───────────────────►│  Spring Boot 3 (Java 21)     │
│  Material + Tailwind│                     │  Hexagonal (Ports/Adapters)  │
└─────────────────────┘                     └──────────────┬───────────────┘
                                                           │
                                                           ▼
                                                ┌─────────────────────┐
                                                │  PostgreSQL 16      │
                                                │  schema: sig        │
                                                └─────────────────────┘
```

**Backend** (`com.escuelaaves.sig`)
- `domain/` — modelos, ports de entrada/salida
- `application/` — casos de uso, DTOs, MapStruct
- `infrastructure/` — REST, JPA, seguridad JWT, stubs de integración

**Frontend** (`frontend/`)
- `core/` — auth, guards, interceptors, servicios
- `shared/` — componentes reutilizables
- `features/` — módulos lazy-loaded
- `layout/` — shell empresarial (sidebar + topbar)

**Integraciones preparadas (stubs)**  
WhatsApp Business API · Google Sheets · Google Drive · Claude AI · n8n · Email · Contabilidad · OCR (puerto listo)

---

## Módulos

| Módulo | Descripción |
|--------|-------------|
| Login | Acceso premium, recordarme, recuperar contraseña |
| Dashboard | KPIs en vivo + panel de conversaciones CRM |
| Conversaciones | Inbox WhatsApp Business + CRM |
| Clientes | Administración CRM completa |
| Analítica | Gráficas ApexCharts |
| Notificaciones | Centro de alertas |
| Reportes | Exportación CSV / PDF |
| Usuarios | Administración y roles |
| Perfil / Configuración | Preferencias del sistema |

### Roles y acceso
- **ADMINISTRADOR / GERENCIA** — acceso completo
- **COMERCIAL** — dashboard, conversaciones, clientes, notificaciones, reportes
- **CONTABILIDAD** — dashboard, analítica, clientes, reportes, notificaciones
- **OPERACIONES** — dashboard, conversaciones, clientes, notificaciones

---

## Credenciales iniciales

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin` | `Admin123!` | Administrador |

El sistema arranca vacío (sin clientes, conversaciones ni notificaciones). Puedes crear el resto de usuarios desde el módulo **Usuarios**.

---

## Cómo ejecutar (Docker — recomendado)

> **Importante:** este proyecto **no se despliega en Vercel**. Es un monorepio con
> Angular + Spring Boot + PostgreSQL. Usa **Docker Compose** (o backend/frontend por separado).

Requisitos: Docker Desktop.

```bash
cp .env.example .env   # si aún no tienes .env
docker compose up --build
```

Servicios:
- Frontend: http://localhost:5173  
- Backend API: http://localhost:8081  
- Swagger: http://localhost:8081/swagger-ui.html  
- PostgreSQL: localhost:5433  

> Si ya existía un volumen con datos viejos y quieres reseeding:  
> `docker compose down -v && docker compose up --build`

### Frontend en desarrollo local

```bash
cd frontend
npm install
npm start
```

Abre http://localhost:5173 (API en `http://localhost:8081/api/v1`).

---

## API

Base path: `/api/v1`

Documentación interactiva: Swagger UI.  
Colección Postman: `postman/sig-escuela-aves.postman_collection.json`  
Detalle de endpoints: [README-ENDPOINTS.md](./README-ENDPOINTS.md)

---

## Funcionalidades adicionales incluidas

Además del alcance solicitado, la plataforma deja preparado:
- Matriz RBAC por módulo (lectura/escritura)
- Auditoría básica
- Centro de estado de integraciones
- Arquitectura lista para: clasificación de mensajes, detección de intención, priorización automática, resúmenes con IA y automatizaciones contables
- Diseño glassmorphism, microinteracciones y shell tipo Linear/HubSpot

---

## Stack

**Frontend:** Angular 21 · Angular Material · Tailwind CSS · RxJS · Signals · SCSS · ApexCharts  
**Backend:** Java 21 · Spring Boot 3 · Security JWT · JPA/Hibernate · MapStruct · Lombok · PostgreSQL · Docker
