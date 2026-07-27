# Compatibilidad funcional del frontend

Ultima revision: 2026-04-21

## Objetivo

Este documento define lo minimo que debe conservar un frontend nuevo para reemplazar al frontend actual sin perder funciones del sistema.

Aplica en dos escenarios:

- Si el frontend nuevo se conecta al backend actual, debe consumir los endpoints y respetar las reglas descritas aqui.
- Si tambien cambia el backend, debe mantenerse el mismo comportamiento funcional o agregarse una capa adaptadora para no romper el nuevo frontend.

## Regla base

- El backend es la fuente de verdad para permisos, aprobaciones, ingresos e historial.
- El frontend puede cambiar diseno, estructura, componentes y manejo de estado.
- Lo que no puede cambiar sin acuerdo explicito es el comportamiento por rol, las acciones disponibles y el resultado de negocio.
- Los guards del frontend son solo una ayuda de navegacion. La restriccion real debe seguir en backend.

## Perfiles que existen hoy

| Perfil visible en frontend | Roles backend asociados | Alcance funcional minimo |
| --- | --- | --- |
| Invitado | ninguno | Ver tienda, buscar productos, usar carrito y registrar pedido con nombre y correo. |
| Usuario portal | `CLI` | Iniciar sesion o registrarse, ver perfil, ver sus pedidos, comprar desde carrito. |
| Trabajador | `INV`, `BOD`, `COM`, `DES`, `CAL`, `CON`, `GER`, `AUD` | Entrar a `/interno`, ver panel operativo, bodegas, stock, pedidos, ingresos y salidas, movimientos; aprobar pedidos pendientes; registrar ingresos directos y ventas locales. |
| Admin | `ADMIN` | Todo lo del trabajador mas ingresos comerciales, reinicio persistente de ingresos, resumen comercial, productos, usuarios internos y clientes portal. |

## Rutas que debe conservar el front nuevo

| Ruta | Acceso | Funcion actual |
| --- | --- | --- |
| `/tienda` | publico | Vitrina principal, busqueda, categorias, carrito, checkout, login/registro de cliente, perfil y pedidos del cliente. |
| `/login` | legado | Redirige a `/tienda`. No tiene pantalla propia real. |
| `/interno/panel` | trabajador y admin | Panel principal. Admin ve resumen comercial. Trabajador ve accesos operativos. |
| `/interno/bodegas` | trabajador y admin | Lista de bodegas con busqueda y paginacion. |
| `/interno/stock` | trabajador y admin | Stock disponible con busqueda, paginacion y refresco automatico. |
| `/interno/pedidos` | trabajador y admin | Pedidos web, aprobacion, anulacion y subtotales segun rol. |
| `/interno/ingresos-salidas` | trabajador y admin | Ingreso directo de inventario, venta local, consulta de productos/existencias y bloque de ingresos solo admin. |
| `/interno/movimientos` | trabajador y admin | Historial de movimientos agrupado por mes. |
| `/interno/productos` | solo admin | Crear categorias, crear productos, editar precio de catalogo y retirar productos. |
| `/interno/usuarios` | solo admin | Activar o desactivar usuarios internos. |
| `/interno/clientes` | solo admin | Ver clientes portal y quitar su acceso web. |

## Comportamiento obligatorio por modulo

### 1. Tienda publica

- Debe mostrar resumen comercial basico usando `GET /api/public/resumen`.
- Debe listar productos publicos usando `GET /api/public/productos`.
- Debe permitir filtrar o buscar productos del catalogo.
- Debe tener carrito local y calcular total referencial.
- Debe permitir checkout como invitado. El minimo exigido hoy es nombre y correo.
- Si el cliente portal esta autenticado, el checkout debe precargar sus datos y el pedido debe quedar visible luego en "Mis pedidos".
- Debe permitir login y registro de cliente portal.
- Debe mostrar sesion de cliente y sus pedidos previos.
- Debe seguir existiendo la separacion entre zona publica y zona interna.

### 2. Panel interno

- Trabajador y admin pueden entrar.
- Admin debe ver resumen comercial desde `GET /api/admin/resumen-comercio`.
- Trabajador no debe ver metricas de ingresos ni accesos administrativos.

### 3. Pedidos canal web

- Debe consultar `GET /api/operaciones/pedidos-web`.
- Un pedido `PENDIENTE` debe poder aprobarse por admin y por trabajador.
- Solo admin debe poder anular pedidos `PENDIENTE` o `BORRADOR`.
- Solo admin debe ver subtotal o ingresos asociados a pedidos.
- Esta regla no es solo visual: el backend actual ya oculta el subtotal a no admin.

### 4. Ingresos y salidas

- Debe consultar `GET /api/operaciones/ingresos-salidas`.
- Debe permitir registrar ingreso directo con `POST /api/operaciones/ingresos-directos`.
- Debe permitir registrar venta local con `POST /api/operaciones/ventas-locales`.
- Debe mostrar tabla de productos y tabla de existencias activas.
- El bloque "Ingresos comerciales" debe ser visible solo para admin.
- Admin debe poder ver ingresos vigentes, ingresos historicos, ingresos por mes y reinicios guardados.
- Admin debe poder usar el boton de reinicio y dejar el contador visible en `0` sin perder historial.

### 5. Movimientos

- Debe consultar `GET /api/reportes/movimientos`.
- Debe mostrar el historial ya realizado.
- Debe quedar separado por mes.
- Hoy el backend entrega filas planas y el frontend actual hace la agrupacion por mes. El frontend nuevo puede mantener esa logica o moverla al backend, pero el resultado visible debe mantenerse.

### 6. Bodegas y stock

- Bodegas usa `GET /api/catalogos/bodegas`.
- Stock usa `GET /api/inventario/stock`.
- Deben mantener busqueda y consulta rapida para operacion.

### 7. Productos

- Solo admin.
- Debe permitir crear categoria con `POST /api/catalogos/categorias`.
- Debe permitir crear producto con `POST /api/catalogos/productos`.
- Debe permitir cambiar precio de catalogo con `PATCH /api/catalogos/productos/{id}/precio-catalogo`.
- Debe permitir retirar producto con `DELETE /api/catalogos/productos/{id}`.

### 8. Usuarios internos

- Solo admin.
- Debe listar usuarios con `GET /api/admin/usuarios-sistema`.
- Debe permitir activar o desactivar con `PATCH /api/admin/usuarios-sistema/{id}/activo`.
- Desactivar debe impedir el inicio de sesion, no borrar el registro.

### 9. Clientes portal

- Solo admin.
- Debe listar cuentas portal con `GET /api/catalogos/usuarios-portal`.
- Debe permitir quitar acceso portal con `DELETE /api/catalogos/usuarios-portal/{id}`.
- Quitar portal no debe borrar el tercero comercial.

## Reglas criticas que no se pueden perder

- Un trabajador debe poder aprobar pedidos.
- Un trabajador no debe poder ver ingresos comerciales ni subtotales de pedidos.
- Solo admin puede consultar, ver y reiniciar ingresos comerciales.
- El reinicio de ingresos debe guardarse en base de datos y dejar trazabilidad historica.
- Debe existir vista de ingresos por mes.
- Debe existir vista de movimientos separados por mes.
- La seguridad real debe seguir en backend, no solo en el frontend.

## Endpoints minimos que hoy usa el frontend

### Autenticacion y sesion

| Endpoint | Uso actual | Respuesta minima esperada |
| --- | --- | --- |
| `POST /api/auth/login` | Login interno y tambien login por correo cuando existe JWT para cliente | `token`, `username`, `roles[]` |
| `GET /api/public/clientes/session` | Hidratar sesion del cliente portal autenticado | `customer`, `orders[]` |
| `POST /api/public/clientes/login` | Login del cliente portal | `customer`, `orders[]` |
| `POST /api/public/clientes/register` | Registro del cliente portal | `customer`, `orders[]` |

### Comercio publico

| Endpoint | Uso actual | Respuesta minima esperada |
| --- | --- | --- |
| `GET /api/public/resumen` | Metricas basicas de la tienda | `productos_activos`, `categorias_activas`, `bodegas_activas` |
| `GET /api/public/productos` | Catalogo publico | objeto con `items[]` |
| `POST /api/public/pedidos` | Registro de pedido web | `message`, `reference`, `linkedToAccount`, `order` |
| `GET /api/public/clientes/{id}/pedidos` | Historial del cliente | objeto con `orders[]` |

### Operacion interna

| Endpoint | Uso actual | Regla funcional |
| --- | --- | --- |
| `GET /api/operaciones/pedidos-web` | Lista pedidos web | `subtotal` solo debe venir para admin |
| `POST /api/operaciones/pedidos-web/{id}/aprobar` | Aprobar pedido pendiente | admin y trabajador |
| `POST /api/operaciones/pedidos-web/{id}/anular` | Anular pedido | solo admin |
| `GET /api/operaciones/ingresos-salidas` | Datos de trabajo para ingresos/salidas | retorna `products[]` y `stocks[]` |
| `POST /api/operaciones/ingresos-directos` | Alta manual de inventario | registra movimiento persistente |
| `POST /api/operaciones/ventas-locales` | Venta local | registra salida persistente |
| `GET /api/reportes/movimientos` | Historial operativo | filas de movimientos para agrupar por mes |
| `GET /api/catalogos/bodegas` | Consulta de bodegas | acceso staff |
| `GET /api/inventario/stock` | Consulta de existencias | acceso staff |

### Administracion

| Endpoint | Uso actual | Respuesta minima esperada |
| --- | --- | --- |
| `GET /api/admin/resumen-comercio` | Panel admin | `pedidos_vigentes`, `ingresos_pedidos_centavos`, `fecha_ultimo_corte`, `usuarios_sistema_activos`, `clientes_portal`, `productos_activos` |
| `GET /api/admin/ingresos-comercio` | Bloque de ingresos admin | `ingresos_pedidos_centavos`, `ingresos_totales_centavos`, `ultimo_corte`, `mensual[]`, `reinicios[]` |
| `POST /api/admin/ingresos-comercio/reiniciar` | Reiniciar ingresos visibles | guarda corte y responde estado del reinicio |
| `GET /api/admin/usuarios-sistema` | Lista usuarios internos | arreglo de usuarios |
| `PATCH /api/admin/usuarios-sistema/{id}/activo` | Activar o desactivar usuario | estado actualizado |
| `GET /api/catalogos/usuarios-portal` | Lista clientes portal | arreglo de clientes |
| `DELETE /api/catalogos/usuarios-portal/{id}` | Quitar acceso portal | eliminacion logica del acceso web |
| `GET /api/catalogos/categorias` | Catalogo admin de categorias | arreglo de categorias |
| `POST /api/catalogos/categorias` | Crear categoria | `id` |
| `GET /api/catalogos/unidades-medida` | Metadata de productos | arreglo de unidades |
| `GET /api/catalogos/productos` | Lista productos | arreglo de productos |
| `POST /api/catalogos/productos` | Crear producto | `id` |
| `PATCH /api/catalogos/productos/{id}/precio-catalogo` | Cambiar precio | estado actualizado |
| `DELETE /api/catalogos/productos/{id}` | Retirar producto | estado actualizado |

## Que hoy esta realmente resuelto en backend

- Permisos por rol en endpoints internos y administrativos.
- Aprobacion de pedidos por trabajador.
- Restriccion real de ingresos solo para admin.
- Reinicio persistente de ingresos con historial.
- Endpoint de movimientos.

## Que hoy arma el frontend y debe replicarse

- Agrupacion visual de movimientos por mes.
- Ocultamiento visual de enlaces administrativos para no admin.
- Guardias de navegacion para separar publico, trabajador y admin.
- Integracion de carrito, checkout y area de cliente portal dentro de `/tienda`.

## Detalles de implementacion que pueden cambiar sin romper compatibilidad

- El diseno visual.
- El framework o la estructura del frontend.
- El mecanismo de refresco automatico. Hoy se usa polling; manana puede ser websocket o refresco manual.
- Las claves de `localStorage`.
- Que la agrupacion mensual de movimientos viva en frontend o en backend.
- El fallback del frontend actual para backends viejos en la pantalla de ingresos y salidas. Si el nuevo frontend apunta al backend actual, no es obligatorio conservar ese fallback.

## Checklist de aceptacion para el frontend nuevo

- [ ] Un invitado puede ver catalogo, agregar productos al carrito y registrar un pedido.
- [ ] Un cliente portal puede registrarse, iniciar sesion y ver sus pedidos.
- [ ] `/login` sigue redirigiendo a `/tienda` o queda cubierto por un reemplazo equivalente acordado.
- [ ] Un trabajador puede entrar a `/interno/panel`, `/interno/bodegas`, `/interno/stock`, `/interno/pedidos`, `/interno/ingresos-salidas` y `/interno/movimientos`.
- [ ] Un trabajador puede aprobar un pedido pendiente.
- [ ] Un trabajador no ve subtotales ni ingresos comerciales.
- [ ] Un admin si ve subtotales en pedidos y el bloque de ingresos comerciales.
- [ ] Un admin puede reiniciar ingresos y luego el contador visible queda en `0`.
- [ ] El reinicio no elimina el historial de ingresos ni los cortes previos.
- [ ] La vista de ingresos por mes sigue existiendo.
- [ ] La vista de movimientos sigue mostrando historial agrupado por mes.
- [ ] Un admin puede crear categoria, crear producto, cambiar precio y retirar producto.
- [ ] Un admin puede activar o desactivar usuarios internos.
- [ ] Un admin puede quitar acceso portal a un cliente.
- [ ] Las restricciones por rol siguen funcionando aunque alguien intente llamar al endpoint directo.

## Recomendacion para cuando llegue el frontend nuevo

- Usar este documento como criterio de aceptacion funcional.
- Probar contra el backend actual antes de tocar permisos.
- Si el frontend nuevo necesita otro formato de datos, adaptar el backend sin romper estas reglas o crear endpoints compatibles nuevos.
- Si quieres reducir el riesgo del cambio, conviene mover a backend la agrupacion mensual de movimientos y dejarla ya como contrato oficial.
