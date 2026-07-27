SET search_path TO negocio, public;

DO $$
DECLARE
  v_emp UUID;
  v_um_un UUID;
  v_b1 UUID;
  v_b2 UUID;
  v_b3 UUID;
  v_b1_alm UUID;
  v_b1_pick UUID;
  v_b2_alm UUID;
  v_b2_pick UUID;
  v_b3_alm UUID;
  v_b3_pick UUID;
  v_cat UUID;
  v_prod UUID;
  v_lote UUID;
  v_bodega UUID;
  v_ubic UUID;
  v_sku TEXT;
  v_barcode TEXT;
  v_nombre TEXT;
  v_desc TEXT;
  v_cod_cat TEXT;
  v_part_a TEXT;
  v_part_b TEXT;
  v_cat_seq INTEGER;
  v_precio INTEGER;
  v_vida INTEGER;
  i INTEGER;
BEGIN
  SELECT id INTO v_emp FROM negocio.empresas ORDER BY creado_en ASC LIMIT 1;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'No existe empresa para cargar operación base.';
  END IF;

  INSERT INTO negocio.unidades_medida(codigo, nombre, simbolo, tipo, decimales, activo)
  VALUES
    ('UN', 'Unidad', 'und', 'CONTEO', 0, true),
    ('KG', 'Kilogramo', 'kg', 'PESO', 3, true),
    ('CJ', 'Caja', 'cj', 'EMPAQUE', 0, true)
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id INTO v_um_un FROM negocio.unidades_medida WHERE codigo = 'UN' LIMIT 1;

  -- Limpiar solo maestros operativos para recargarlos.
  DELETE FROM negocio.inventario_existencias;
  DELETE FROM negocio.lotes;
  DELETE FROM negocio.productos_presentaciones;
  DELETE FROM negocio.productos_conversiones;
  DELETE FROM negocio.productos WHERE id_empresa = v_emp;
  DELETE FROM negocio.categorias WHERE id_empresa = v_emp;
  DELETE FROM negocio.rutas_bodega;
  DELETE FROM negocio.ubicaciones WHERE id_bodega IN (SELECT id FROM negocio.bodegas WHERE id_empresa = v_emp);
  DELETE FROM negocio.bodegas WHERE id_empresa = v_emp;

  INSERT INTO negocio.bodegas(
    id_empresa, codigo, nombre, tipo_bodega, direccion, ciudad, departamento,
    horario, temperatura_min, temperatura_max, capacidad_maxima, activa
  ) VALUES
    (v_emp, 'BOD-PRINC', 'Bodega Principal', 'PRINCIPAL', 'Zona Industrial 1', 'Bogota', 'Cundinamarca', 'L-S 06:00-19:00', 0, 4, 80000, true),
    (v_emp, 'BOD-NORTE', 'Bodega Norte', 'SATELITE', 'Zona Norte', 'Bogota', 'Cundinamarca', 'L-S 06:00-18:00', 0, 4, 42000, true),
    (v_emp, 'BOD-SUR', 'Bodega Sur', 'SATELITE', 'Zona Sur', 'Bogota', 'Cundinamarca', 'L-S 06:00-18:00', 0, 4, 42000, true);

  SELECT id INTO v_b1 FROM negocio.bodegas WHERE id_empresa = v_emp AND codigo = 'BOD-PRINC' LIMIT 1;
  SELECT id INTO v_b2 FROM negocio.bodegas WHERE id_empresa = v_emp AND codigo = 'BOD-NORTE' LIMIT 1;
  SELECT id INTO v_b3 FROM negocio.bodegas WHERE id_empresa = v_emp AND codigo = 'BOD-SUR' LIMIT 1;

  INSERT INTO negocio.ubicaciones(
    id_bodega, codigo, nombre, tipo_ubicacion, nivel, permite_picking,
    temperatura_min, temperatura_max, activa
  ) VALUES
    (v_b1, 'ALM-A1', 'Almacen A1', 'ALMACENAMIENTO', 1, false, 0, 4, true),
    (v_b1, 'PICK-P1', 'Picking P1', 'PICKING', 1, true, 0, 4, true),
    (v_b2, 'ALM-A1', 'Almacen A1', 'ALMACENAMIENTO', 1, false, 0, 4, true),
    (v_b2, 'PICK-P1', 'Picking P1', 'PICKING', 1, true, 0, 4, true),
    (v_b3, 'ALM-A1', 'Almacen A1', 'ALMACENAMIENTO', 1, false, 0, 4, true),
    (v_b3, 'PICK-P1', 'Picking P1', 'PICKING', 1, true, 0, 4, true);

  SELECT id INTO v_b1_alm FROM negocio.ubicaciones WHERE id_bodega = v_b1 AND codigo = 'ALM-A1' LIMIT 1;
  SELECT id INTO v_b1_pick FROM negocio.ubicaciones WHERE id_bodega = v_b1 AND codigo = 'PICK-P1' LIMIT 1;
  SELECT id INTO v_b2_alm FROM negocio.ubicaciones WHERE id_bodega = v_b2 AND codigo = 'ALM-A1' LIMIT 1;
  SELECT id INTO v_b2_pick FROM negocio.ubicaciones WHERE id_bodega = v_b2 AND codigo = 'PICK-P1' LIMIT 1;
  SELECT id INTO v_b3_alm FROM negocio.ubicaciones WHERE id_bodega = v_b3 AND codigo = 'ALM-A1' LIMIT 1;
  SELECT id INTO v_b3_pick FROM negocio.ubicaciones WHERE id_bodega = v_b3 AND codigo = 'PICK-P1' LIMIT 1;

  INSERT INTO negocio.categorias(id_empresa, codigo, nombre, descripcion, activo)
  VALUES
    (v_emp, 'POL-ASADO', 'Pollos asados', 'Línea asados listos', true),
    (v_emp, 'POL-APAN', 'Apanados premium', 'Productos apanados premium', true),
    (v_emp, 'POL-CONG', 'Congelados', 'Línea congelados', true),
    (v_emp, 'POL-RETL', 'Retail empacado', 'Empaque para anaquel', true),
    (v_emp, 'POL-HORE', 'Food service', 'Productos para horeca', true),
    (v_emp, 'POL-INST', 'Institucional', 'Productos institucionales', true);

  FOR i IN 1..180 LOOP
    v_cat_seq := ((i - 1) / 6) + 1;

    CASE ((i - 1) % 6)
      WHEN 0 THEN
        v_cod_cat := 'POL-ASADO'; v_nombre := 'Pollo asado'; v_desc := 'Asado listo para vitrina'; v_vida := 7;
      WHEN 1 THEN
        v_cod_cat := 'POL-APAN'; v_nombre := 'Milanesa apanada'; v_desc := 'Apanado premium para freidora'; v_vida := 10;
      WHEN 2 THEN
        v_cod_cat := 'POL-CONG'; v_nombre := 'Corte congelado'; v_desc := 'Producto congelado IQF'; v_vida := 60;
      WHEN 3 THEN
        v_cod_cat := 'POL-RETL'; v_nombre := 'Bandeja retail'; v_desc := 'Empaque retail para anaquel'; v_vida := 15;
      WHEN 4 THEN
        v_cod_cat := 'POL-HORE'; v_nombre := 'Food service'; v_desc := 'Formato horeca'; v_vida := 20;
      ELSE
        v_cod_cat := 'POL-INST'; v_nombre := 'Institucional'; v_desc := 'Formato institucional'; v_vida := 25;
    END CASE;

    CASE ((v_cat_seq - 1) % 10)
      WHEN 0 THEN v_part_a := 'Clasico';
      WHEN 1 THEN v_part_a := 'Campestre';
      WHEN 2 THEN v_part_a := 'Criollo';
      WHEN 3 THEN v_part_a := 'Delicia';
      WHEN 4 THEN v_part_a := 'Supremo';
      WHEN 5 THEN v_part_a := 'Tradicion';
      WHEN 6 THEN v_part_a := 'Selecto';
      WHEN 7 THEN v_part_a := 'Especial';
      WHEN 8 THEN v_part_a := 'Autentico';
      ELSE v_part_a := 'Brasa';
    END CASE;

    CASE ((v_cat_seq - 1) / 10)
      WHEN 0 THEN v_part_b := 'Linea Norte';
      WHEN 1 THEN v_part_b := 'Linea Centro';
      ELSE v_part_b := 'Linea Sur';
    END CASE;

    SELECT id INTO v_cat FROM negocio.categorias WHERE id_empresa = v_emp AND codigo = v_cod_cat LIMIT 1;
    v_sku := format('SKU-%s-%s', substring(v_cod_cat from 5 for 4), to_char(i, 'FM000'));
    v_barcode := (770300000000 + i)::text;
    v_precio := 11900 + (i * 120);

    INSERT INTO negocio.productos(
      id_empresa, id_categoria, id_unidad_base, codigo_sku, codigo_barras, nombre, descripcion, marca,
      tipo_producto, maneja_lotes, maneja_vencimiento, maneja_temperatura, tipo_control_vencimiento,
      dias_vida_util, dias_minimos_recepcion, dias_minimos_despacho, temperatura_min, temperatura_max,
      requiere_documento_sanitario, requiere_rotulado, precio_catalogo_centavos, estado
    ) VALUES (
      v_emp, v_cat, v_um_un, v_sku, v_barcode, v_nombre || ' ' || v_part_a || ' ' || v_part_b || ' ' || to_char(v_cat_seq, 'FM000'), v_desc, 'Inventario Pollos',
      'TERMINADO'::negocio.tipo_producto_enum, true, true, true, 'FEFO'::negocio.tipo_control_vencimiento_enum,
      v_vida, 0, 0, 0, 4, false, false, v_precio, 'ACTIVO'::negocio.estado_registro_enum
    ) RETURNING id INTO v_prod;

    INSERT INTO negocio.lotes(
      id_producto, codigo_lote, fecha_produccion, fecha_vencimiento, fecha_ingreso,
      temperatura_recepcion, dias_vida_util_inicial, estado_lote, observaciones
    ) VALUES (
      v_prod,
      format('L-%s-001', v_sku),
      current_date - interval '2 day',
      current_date + (v_vida || ' day')::interval,
      now(),
      2.0,
      v_vida,
      'DISPONIBLE'::negocio.estado_inventario_enum,
      'Lote base de inicialización'
    ) RETURNING id INTO v_lote;

    CASE ((i - 1) % 3)
      WHEN 0 THEN
        v_bodega := v_b1;
        v_ubic := CASE WHEN v_cod_cat = 'POL-RETL' THEN v_b1_pick ELSE v_b1_alm END;
      WHEN 1 THEN
        v_bodega := v_b2;
        v_ubic := CASE WHEN v_cod_cat = 'POL-RETL' THEN v_b2_pick ELSE v_b2_alm END;
      ELSE
        v_bodega := v_b3;
        v_ubic := CASE WHEN v_cod_cat = 'POL-RETL' THEN v_b3_pick ELSE v_b3_alm END;
    END CASE;

    INSERT INTO negocio.inventario_existencias(
      id_producto, id_lote, id_bodega, id_ubicacion, estado_inventario,
      cantidad, cantidad_reservada, costo_unitario, fecha_ultima_movimiento
    ) VALUES (
      v_prod, v_lote, v_bodega, v_ubic, 'DISPONIBLE'::negocio.estado_inventario_enum,
      50 + (i % 90), 0, GREATEST(1000, round(v_precio * 0.58, 2)), now()
    );
  END LOOP;
END $$;
