# Requisitos funcionales — SIG Escuela Aves Salento

## Visión
Sistema Inteligente de Gestión (SIG) para centralizar la operación comercial y de atención proveniente de WhatsApp y otros canales, reemplazando gradualmente el uso de Google Sheets como repositorio principal.

## Actores
- Administrador
- Gerencia
- Comercial
- Contabilidad
- Operaciones

## Módulos
1. Autenticación y sesión (JWT, recordarme, recuperación de contraseña)
2. Dashboard operativo con KPIs en tiempo real
3. Conversaciones (inbox CRM + WhatsApp)
4. Clientes (CRM)
5. Analítica avanzada
6. Notificaciones
7. Reportes exportables
8. Usuarios y roles
9. Perfil y configuración
10. Integraciones (arquitectura preparada)

## Integraciones futuras (desacopladas)
- WhatsApp Business API
- Google Sheets / Drive
- Claude AI (clasificación, intención, resúmenes, priorización)
- OCR de facturas
- n8n
- Correo electrónico
- Sistema contable

## No objetivos (fase actual)
- Implementación productiva de IA
- Conexión real a Meta WhatsApp / Google (solo ports + stubs)
