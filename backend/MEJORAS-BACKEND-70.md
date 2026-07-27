# 70 funciones backend adicionales (51–120) — SIG Ops Ext

Servicio: `SigOpsExtendedService` · API: `/api/v1/ops/**` · Swagger: tag **Operaciones SIG Ext**

Complementa las 50 de `MEJORAS-BACKEND-50.md`. Total operativo: **120 funciones**.

## CRM avanzado (51–62)
51. `GET /ops/clients/by-source?source=` — filtrar por fuente
52. `PATCH /ops/clients/{id}/segment` — actualizar segmento
53. `GET /ops/clients/vip`
54. `GET /ops/clients/inactive`
55. `POST /ops/clients/bulk-assign` — reasignación masiva
56. `GET /ops/clients/count-by-source`
57. `POST /ops/clients/{id}/notes/append`
58. `GET /ops/clients/contacted-since?days=`
59. `GET /ops/clients/never-contacted`
60. `GET /ops/clients/{id}/suggest-segment` — heurística VIP/frecuente/nuevo/inactivo
61. `GET /ops/clients/export-by-segment.csv?segment=`
62. `GET /ops/clients/duplicate-phones`

## Inbox / mensajes (63–80)
63. `GET /ops/inbox/mine` — bandeja del usuario actual
64. `GET /ops/inbox/unassigned`
65. `PATCH /ops/inbox/{id}/priority`
66. `PATCH /ops/inbox/{id}/importance`
67. `PATCH /ops/inbox/{id}/category`
68. `POST /ops/inbox/{id}/archive`
69. `POST /ops/inbox/{id}/reopen`
70. `GET /ops/inbox/count-by-status`
71. `GET /ops/inbox/count-by-priority`
72. `GET /ops/inbox/high-priority`
73. `GET /ops/inbox/search?q=`
74. `GET /ops/inbox/{id}/message-count`
75. `GET /ops/messages/recent?limit=`
76. `PATCH /ops/messages/{id}/status`
77. `GET /ops/messages/inbound-outbound`
78. `GET /ops/inbox/without-messages`
79. `POST /ops/inbox/{id}/notes/append`
80. `POST /ops/inbox/bulk-assign`

## Comercial (81–100)
81. `GET /ops/reservations/{id}`
82. `GET /ops/sales/{id}`
83. `PATCH /ops/reservations/{id}/status`
84. `PATCH /ops/sales/{id}/status`
85. `POST /ops/reservations/{id}/convert-sale`
86. `GET /ops/quotes/by-advisor/{advisorId}`
87. `GET /ops/sales/by-advisor/{advisorId}`
88. `GET /ops/reservations/by-client/{clientId}`
89. `GET /ops/sales/by-client/{clientId}`
90. `GET /ops/sales/average-amount`
91. `GET /ops/quotes/average-amount`
92. `GET /ops/quotes/zero-amount`
93. `GET /ops/reservations/confirmed-today`
94. `GET /ops/sales/monthly-series?months=`
95. `GET /ops/quotes/monthly-series?months=`
96. `GET /ops/sales/by-payment-method`
97. `POST /ops/quotes/{id}/clone`
98. `PATCH /ops/quotes/{id}/extend-validity`
99. `GET /ops/reservations/overdue`
100. `GET /ops/commercial/digest`

## Calidad / sync readiness (101–110)
101. `GET /ops/quality/conversations-missing-key`
102. `GET /ops/quality/clients-missing-email`
103. `GET /ops/quality/quotes-missing-advisor`
104. `GET /ops/quality/reservations-missing-quote`
105. `GET /ops/quality/sales-missing-reservation`
106. `GET /ops/quality/orphan-accepted-quotes`
107. `GET /ops/quality/sync-readiness`
108. `GET /ops/quality/duplicate-phones`
109. `GET /ops/inbox/by-category`
110. `GET /ops/inbox/top-categories?limit=`

## Reportes / usuarios / integraciones (111–120)
111. `GET /ops/export/quotes.csv`
112. `GET /ops/export/sales.csv`
113. `GET /ops/export/reservations.csv`
114. `GET /ops/export/advisor-performance.csv`
115. `GET /ops/users/active`
116. `GET /ops/users/inactive`
117. `GET /ops/users/count-by-role`
118. `GET /ops/integrations/health`
119. `PUT /ops/settings/upsert`
120. `GET /ops/digest/operational`

## Archivos
- `application/service/SigOpsExtendedService.java`
- `application/dto/ops/OpsExtendedDtos.java`
- `infrastructure/adapter/in/web/OpsExtendedController.java`
