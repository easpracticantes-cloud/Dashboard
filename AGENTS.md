# AGENTS.md

## Fuente de verdad
Lee y respeta los archivos en `/documentos` y la arquitectura del código:
- `documentos/base_datos_postgresql.sql`
- `documentos/requisitos_funcionales.md` (dominio SIG)
- Backend: `com.escuelaaves.sig` (hexagonal)
- Frontend: Angular 21 + Material + Tailwind

## Objetivo del proyecto
Construir **SIG — Sistema Inteligente de Gestión** para **Escuela Aves Salento**:
plataforma empresarial que centraliza conversaciones (WhatsApp), clientes (CRM),
dashboards, reportes, usuarios/roles y deja lista la arquitectura para
integraciones futuras (WhatsApp Business API, Google Sheets/Drive, Claude AI,
OCR, n8n, correo, contabilidad).

## Alcance funcional mínimo
- Autenticación JWT, recuperar contraseña, recordarme
- Roles: ADMINISTRADOR, GERENCIA, COMERCIAL, CONTABILIDAD, OPERACIONES
- Dashboard operativo en tiempo real (KPIs + panel de conversaciones)
- Clientes (CRM)
- Conversaciones (inbox tipo WhatsApp Business + CRM)
- Analítica (gráficas)
- Notificaciones
- Usuarios y permisos
- Perfil y configuración
- Reportes (CSV / PDF stub)
- Puertos de integración desacoplados (stubs listos)

## Stack obligatorio
### Backend
- Java 21, Spring Boot 3, Maven
- Spring Security + JWT
- Spring Data JPA / Hibernate / PostgreSQL
- Arquitectura hexagonal (Ports & Adapters)
- DTOs, MapStruct, Lombok, validaciones
- Manejo global de excepciones
- OpenAPI / Swagger
- Docker Compose

### Frontend
- Angular (última estable), Angular Material, Tailwind CSS, SCSS
- RxJS + Signals
- Lazy loading, guards, interceptors
- ApexCharts
- Diseño premium, responsive

## Reglas de implementación
- Mantener consistencia entre API, UI, BD y documentación
- No inventar módulos fuera del dominio SIG / Escuela Aves Salento
- Preferir nombres claros y desacoplamiento (SOLID, Clean Architecture)
- Integraciones futuras solo vía ports/adapters
- Documentar endpoints y dejar el proyecto ejecutable con Docker
