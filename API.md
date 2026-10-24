# Aurora Gemini Provider API

Proveedor personal de imágenes basado en la CLI de Antigravity / Gemini (`agy` / `gemini`).
Expone un contrato HTTP compatible en loopback (`127.0.0.1:54800` por defecto).

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/v1/status` | Estado del motor, modelos y capacidades de encuadre. |
| GET | `/api/presets` | Proporciones (`1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`), resoluciones (`1024`, `2048`) y expresiones. |
| POST | `/v1/references` | Subida de referencia visual PNG/JPG/WebP (máximo 12 MB). Devuelve UUID. |
| POST | `/v1/images/generations` | Creación de trabajo desde prompt de texto. |
| POST | `/v1/images/edits` | Creación de trabajo condicionado con referencias y encuadre. |
| POST | `/v1/batches` | Creación de lote de variaciones (e.g. expresiones). |
| GET | `/v1/jobs` | Lista de trabajos recientes. |
| GET | `/v1/jobs/:id` | Consulta de progreso y URLs de resultados. |
| POST | `/v1/jobs/:id/(pause\|resume\|cancel)` | Control del ciclo de vida del trabajo. |
| GET | `/v1/jobs/:id/download` | Descarga de ZIP con todas las imágenes del trabajo. |
| GET | `/images/:id` | Descarga de la imagen generada. |
