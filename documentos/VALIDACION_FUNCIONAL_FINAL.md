# Validacion Funcional Final (Guia de cierre)

Este documento define una validacion manual minima para declarar la entrega completa sin modificar codigo.

## Precondiciones

- Servicios arriba con Docker Compose
- Base de datos cargada
- Frontend accesible en `http://localhost:5173`
- Backend accesible en `http://localhost:8081`
- Coleccion Postman importada

## Casos minimos por perfil

## 1) Administrador

- Inicia sesion con `admin/admin123`
- Accede a panel interno
- Crea una categoria
- Crea un producto
- Actualiza precio de catalogo
- Retira un producto
- Consulta usuarios del sistema

Resultado esperado: operaciones se reflejan en pantalla sin recargar toda la app.

## 2) Trabajador

- Inicia sesion con `trabajador/trabajador123`
- Accede a panel operativo
- Consulta bodegas
- Consulta stock
- Consulta pedidos

Resultado esperado: puede ver, no ejecutar acciones de administracion restringidas.

## 3) Cliente (portal)

- Registra cuenta en tienda
- Inicia sesion
- Explora catalogo paginado
- Agrega al carrito y crea pedido
- Consulta su cuenta/pedidos

Resultado esperado: no accede a rutas internas administrativas.

## 4) API (Postman)

- Ejecuta `Auth > Login` y confirma guardado de `jwt`
- Ejecuta requests GET de:
  - catalogos
  - dashboard
  - reportes
  - operaciones
  - publico

Resultado esperado: respuestas 200 para consultas permitidas por rol.

## Criterio de cierre

Si todos los escenarios anteriores son satisfactorios y la documentacion coincide con los endpoints reales, la entrega puede considerarse cerrada funcionalmente.
