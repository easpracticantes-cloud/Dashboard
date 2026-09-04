# Nota histórica

`set-render-gemini.ps1` configuraba variables vía API de Render.
En Oracle Cloud las variables viven en `.env` leído por Docker Compose.
No ejecutar scripts Render contra el entorno Oracle.
