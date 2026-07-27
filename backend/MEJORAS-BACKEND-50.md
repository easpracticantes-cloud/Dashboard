# 50 funciones backend nuevas — SIG Ops

Servicio: `SigOpsService` · API: `/api/v1/ops/**` · Swagger: tag **Operaciones SIG**

## CRM (1–10)
1. `GET /ops/clients/search?q=` — búsqueda
2. `GET /ops/clients/by-segment` — conteo por segmento
3. `POST /ops/clients/{id}/assign` — asignar asesor
4. `POST /ops/clients/{id}/touch` — último contacto
5. `POST /ops/clients/{id}/tags/add` — tags
6. `POST /ops/clients/{id}/tags/remove`
7. `POST /ops/clients/find-or-create` — por teléfono (WhatsApp inbound)
8. `GET /ops/clients/{id}/timeline` — historial unificado
9. `GET /ops/clients/unassigned`
10. `GET /ops/clients/export.csv`

## Inbox (11–20)
11. `GET /ops/inbox/unread-total`
12. `GET /ops/inbox/unread-by-advisor`
13. `POST /ops/inbox/{id}/read`
14. `POST /ops/inbox/{id}/unread`
15. `POST /ops/inbox/bulk-status`
16. `POST /ops/inbox/{id}/transfer` (+ notificación)
17. `POST /ops/inbox/{id}/labels/add`
18. `POST /ops/inbox/{id}/labels/remove`
19. `GET /ops/inbox/stale?days=7`
20. `POST /ops/inbox/{id}/close`

## Comercial (21–32)
21. `GET /ops/quotes/{id}`
22. `PATCH /ops/quotes/{id}/status`
23. `GET /ops/quotes/by-client/{clientId}`
24. `GET /ops/quotes/expiring?days=7`
25. `POST /ops/quotes/{id}/convert-reservation`
26. `GET /ops/commercial/pipeline`
27. `GET /ops/quotes/amounts-by-status`
28. `GET /ops/sales/period?from=&to=`
29. `GET /ops/sales/sum?from=&to=`
30. `PATCH /ops/sales/{id}/payment-method`
31. `GET /ops/reservations/upcoming?days=14`
32. `POST /ops/reservations/{id}/cancel`

## Insights (33–42)
33. `GET /ops/insights/health`
34. `GET /ops/insights/funnel`
35. `GET /ops/insights/advisor-workload`
36. `GET /ops/insights/channels`
37. `GET /ops/insights/priorities`
38. `GET /ops/insights/daily-volume?days=30`
39. `GET /ops/insights/top-clients?limit=10`
40. `GET /ops/insights/conversion-quote-sale`
41. `GET /ops/insights/response-lag`
42. `GET /ops/insights/data-quality`

## Notificaciones / auditoría / usuarios (43–50)
43. `POST /ops/notifications`
44. `POST /ops/notifications/mark-all-read`
45. `GET /ops/notifications/unread-count`
46. `POST /ops/notifications/conversation-assigned/{id}`
47. `POST /ops/notifications/quotes-expiring`
48. `POST /ops/audit`
49. `GET /ops/audit/recent`
50. `PATCH /ops/users/{id}/active?active=true|false`

Todas requieren JWT (excepto rutas públicas de auth).
