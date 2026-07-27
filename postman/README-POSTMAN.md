# Coleccion Postman

## Archivo

- `postman/inventario-pollos.postman_collection.json`

## Variables de entorno

Configurar en Postman:

- `baseUrl = http://localhost:8081`
- `jwt = ` (vacio inicialmente)
- `idBodega = ` (opcional para pruebas de POST)
- `idProducto = ` (opcional para pruebas de POST)
- `idProveedor = ` (opcional para pruebas de POST)

## Importacion

1. Abrir Postman
2. `Import` -> seleccionar `inventario-pollos.postman_collection.json`
3. Crear/seleccionar entorno con variables anteriores

## Flujo recomendado de prueba

1. Ejecutar `Auth > Login` para guardar `jwt` automaticamente
2. Validar modulos en este orden:
   - `Catalogos Basicos`
   - `Catalogos Gestionables`
   - `Compras y Recepciones`
   - `Operaciones`
   - `Dashboard y Reportes`
   - `Publico`
3. Para endpoints `POST` que requieren IDs, primero consultar los `GET` correspondientes y copiar ids reales

## Cobertura actual de la coleccion

- Auth JWT
- Catalogos basicos y gestionables
- Compras y recepciones (MVP)
- Operaciones de inventario (consultas principales)
- Dashboard y reportes
- Endpoints publicos (catalogo/comercio)

## Notas

- `POST /api/auth/refresh` existe en backend pero no esta implementado funcionalmente.
- Algunos `POST` operativos complejos requieren payload detallado con IDs reales segun datos de la base.
