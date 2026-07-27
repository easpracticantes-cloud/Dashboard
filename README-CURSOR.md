# Kit base para usar con Cursor

## Qué contiene esta carpeta
- `documentos/`: requisitos funcionales y base de datos SQL
- `AGENTS.md`: instrucciones persistentes para el agente de Cursor
- `prompts/`: prompts listos para usar por fases
- `backend/`, `frontend/`, `postman/`: carpetas vacías para que Cursor genere el proyecto

## Cómo usarlo en Cursor
1. Abre esta carpeta completa en Cursor.
2. Ve al chat del Agent.
3. Activa Plan Mode con `Shift + Tab`.
4. En el prompt adjunta:
   - `@documentos/`
   - `@AGENTS.md`
5. Pega el contenido de `prompts/00_prompt_maestro.txt`.
6. Cuando el plan te convenza, usa luego los prompts por fase.

## Orden recomendado
1. Plan
2. Backend
3. Frontend
4. Pruebas
5. README
6. README-ENDPOINTS
7. Postman

## Nota
La versión en `.csv` y `.md` de requisitos se incluye para facilitar la lectura del agente.
