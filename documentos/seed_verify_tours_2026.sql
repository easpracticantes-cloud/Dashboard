-- Verificación post-seed (tarifas + proveedores)
SELECT code, name, price_per_person, transport_per_person, restaurant_per_person, active
FROM sig.tour_products
ORDER BY code;

SELECT code, name, category, tour_code, priority, active
FROM sig.tour_providers
ORDER BY priority DESC, code;
