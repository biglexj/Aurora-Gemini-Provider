# Arquitectura — Aurora Gemini Provider

- Estado: operativo
- Última actualización: 2026-11-03
- Fuente de verdad del comportamiento: `scripts/` (el código vigente prevalece sobre este documento).

Mapa local de implementación. Los estándares compartidos viven en [Core Docs](../../Docs/README.md); aquí solo se describe lo que es exclusivo de este servicio.

## Estructura

```text
Aurora-Gemini-Provider/
├─ .agents/rules/base.md   Entrada única de instrucciones (puente a Core).
├─ docs/                    Documentación local: arquitectura y operación.
├─ scripts/                 Implementación del servidor y del despachador Mise.
├─ data/                    Trabajo local (lotes, trabajos, referencias, configuración). Fuera de Git.
├─ generated/               Imágenes generadas. Fuera de Git.
├─ API.md                   Contrato HTTP.
├─ mise.toml                Tareas de Mise (dev, build, check, test, release, publish).
└─ Iniciar.cmd              Lanzador de doble clic para Windows.
```

## Módulos de `scripts/`

| Módulo | Responsabilidad |
| --- | --- |
| `provider.mjs` | Servidor HTTP en loopback. Rutas `/v1/*`, `/api/*`, `/images/*`, `/references/*`. |
| `gemini-native.mjs` | Genera invocando la CLI `agy` / `gemini` y localiza el archivo producido. |
| `gemini-binary.mjs` | Resuelve el ejecutable de la CLI en Windows y Linux. |
| `batches.mjs` | Cola de lotes: persistencia, reanudación, pausa, reanudación y cancelación. |
| `assets.mjs` | Referencias y exportaciones con `sharp`: normaliza, recorta y guarda. |
| `presets.mjs` | Expresiones, proporciones, resoluciones y cálculo del tamaño de salida. |
| `reference-roles.mjs` | Valida los papeles de referencia (`base`, `identity`, `outfit`, `pose`, `style`, `background`). |
| `prompt-limits.mjs` | Límites del prompt y del cuerpo JSON. |
| `request-body.mjs` | Lectura del cuerpo de la petición con tope de bytes. |
| `config.mjs` | Configuración local: puerto y orígenes permitidos. |
| `zip.mjs` | ZIP del lote con `manifest.json`. |
| `mise-task.ts` | Despachador único de tareas Mise. |
| `provider.test.mjs` | Pruebas unitarias de los módulos puros. |

## Flujo de una generación

1. `provider.mjs` valida la petición (ruta, `content-type`, tamaño del cuerpo, prompt) y normaliza la entrada.
2. `batches.mjs` crea el lote, lo persiste en `data/image-batches/` y lo encola. Si ya hay un lote activo, se rechaza.
3. `gemini-native.mjs` invoca la CLI `agy` / `gemini` con `-p`, `--dangerously-skip-permissions` y `--output-format json`, y espera hasta 480 segundos.
4. La imagen generada se copia a `generated/<id>.<ext>`; el archivo original se localiza en el directorio `brain` de Antigravity con el prefijo `gemini_job_<id>`.
5. `assets.mjs` normaliza el resultado al tamaño de la proporción elegida y lo deja en `generated/<lote>/NN_expresion.png`.
6. `batches.mjs` marca el elemento como completado y actualiza el estado del lote.

## Cola y persistencia

- Una generación por vez: la cola de lotes rechaza un lote nuevo mientras exista otro activo; la cola nativa admite hasta tres pendientes.
- El estado vive en `data/image-batches/<id>.json` y en `data/image-jobs/<id>/job.json`.
- Al arrancar, los lotes que estaban `queued`, `running`, `pausing` o `cancelling` pasan a `paused` y sus elementos en curso a `interrupted`.
- El proceso escribe `data/server.pid.json` con PID, puerto y hora de arranque.

## Contratos de la API

- Escucha solo en `127.0.0.1`. Rechaza con `403` cualquier `Host` que no sea `127.0.0.1:<puerto>` o `localhost:<puerto>`.
- Acepta `Origin` propio o los orígenes guardados en `data/provider-config.json` (hasta ocho). El entorno `LOCAL_IMAGE_ALLOWED_ORIGINS` los sustituye.
- Prompt de hasta 20 000 caracteres; cuerpo JSON de hasta 128 KiB; referencia de hasta 12 MB (PNG, JPG o WebP estático, hasta 32 megapíxeles); hasta cinco referencias por trabajo; lote de hasta 30 elementos.
- Proporciones: `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`, `9:21`. Salida: lado mayor de 1024 o 2048 píxeles.
- El papel `base` es único y debe ir primero; los lotes de expresiones conservan las referencias de identidad originales.

El detalle de los endpoints está en [API.md](../API.md).
