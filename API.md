# Aurora Gemini Provider API

Proveedor personal de imágenes basado en la CLI de Antigravity / Gemini (`agy` / `gemini`).
Expone un contrato HTTP compatible en loopback (`127.0.0.1:54800` por defecto).

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/v1/status` | Estado del motor, modelos y capacidades de encuadre. |
| GET | `/api/presets` | Proporciones (`1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`, `9:21`), resoluciones (`1024`, `2048`) y expresiones. |
| GET | `/api/config` | Orígenes de frontend permitidos. Solo para peticiones sin `Origin` o con origen propio. |
| POST | `/api/config` | Guarda los orígenes permitidos (hasta ocho) en `data/provider-config.json`. |
| POST | `/v1/references` | Subida de referencia visual PNG/JPG/WebP (máximo 12 MB). Devuelve UUID. |
| POST | `/v1/images/generations` | Creación de trabajo desde prompt de texto. |
| POST | `/v1/images/edits` | Creación de trabajo condicionado con referencias y encuadre. |
| POST | `/v1/batches` | Creación de lote de variaciones (e.g. expresiones). |
| GET | `/v1/jobs` | Lista de trabajos recientes. |
| GET | `/v1/jobs/:id` | Consulta de progreso y URLs de resultados. |
| POST | `/v1/jobs/:id/(pause\|resume\|cancel)` | Control del ciclo de vida del trabajo. |
| GET | `/v1/jobs/:id/download` | Descarga de ZIP con todas las imágenes del trabajo. |
| GET | `/images/:id` | Descarga de la imagen generada. |
| GET | `/references/:id.png` | Descarga de la referencia visual subida. |

Rutas de compatibilidad con clientes anteriores del ecosistema: `GET /api/status` (igual que `/v1/status`), `GET /api/jobs/:id` (consulta de un trabajo) y `POST /api/generate` (creación de trabajo desde prompt de texto).

## Acceso

- El servidor escucha solo en `127.0.0.1`.
- Se rechaza con `403` cualquier `Host` que no sea `127.0.0.1:<puerto>` o `localhost:<puerto>`.
- Se rechaza con `403` cualquier `Origin` que no sea el propio ni uno de los orígenes permitidos. La variable `LOCAL_IMAGE_ALLOWED_ORIGINS` sustituye a la configuración guardada.

## Límites

| Elemento | Límite |
| --- | --- |
| Prompt | 20 000 caracteres |
| Cuerpo JSON del trabajo | 128 KiB |
| Referencia visual | 12 MB, PNG, JPG o WebP estático, hasta 32 megapíxeles |
| Referencias por trabajo | 5 |
| Elementos por lote | 30 |
| Proporciones | `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`, `9:21` |
| Salida | lado mayor de `1024` o `2048` píxeles |

## Referencias y lotes

Cada referencia puede declarar su papel: `base` (única y siempre primera), `identity`, `outfit`, `pose`, `style` y `background`. Los lotes de expresiones conservan las referencias de identidad originales.

Un lote activo bloquea la creación de otro hasta que se pausa, se cancela o termina. Al reiniciar el servicio, los lotes en curso pasan a `paused` y sus elementos en curso a `interrupted`.
