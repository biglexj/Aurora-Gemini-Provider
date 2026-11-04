# Operación — Aurora Gemini Provider

- Estado: operativo
- Última actualización: 2026-11-03
- Fuente de verdad del comportamiento: `scripts/` (el código vigente prevalece sobre este documento).

Cómo se arranca, configura y verifica este servicio. Los estándares compartidos viven en [Core Docs](../../Docs/README.md); aquí solo se describe lo que es exclusivo de este servicio.

## Requisitos

- Node.js 20.9 o superior (ejecuta el servidor).
- Bun (ejecuta el despachador de tareas Mise).
- Sesión iniciada de la CLI de Gemini / Antigravity (`agy` o `gemini`) en el mismo usuario.
- Dependencia `sharp` instalada (`npm install` o `bun install`).

## Interfaz de comandos

Mise es la entrada principal. El despachador es `scripts/mise-task.ts` y todas las tareas apuntan a él.

| Tarea | Qué hace | Publica |
| --- | --- | --- |
| `mise dev` | Inicia el servidor en `http://127.0.0.1:54800`. | No |
| `mise build` | Comprueba la sintaxis de todos los scripts y que `sharp` se resuelve. | No |
| `mise check` | Verifica Node, `sharp`, el binario `agy`/`gemini` y los orígenes permitidos. | No |
| `mise test` | Ejecuta las pruebas unitarias de `scripts/provider.test.mjs`. | No |
| `mise release` | Verifica la preparación local (`build` + `check`). | No |
| `mise publish` | Verificación de publicación; sin `--check` ni `--plan` se niega a publicar. | Solo con acción manual autorizada |

Opciones:

- `--plan`: muestra lo que se ejecutaría. No ejecuta, no escribe ni consulta la red. Válido en todas las tareas.
- `--check`: solo lectura. Válido únicamente en `publish`.

Los alias de `package.json` delegan en el mismo despachador (`npm run build`, `npm run check`, `npm test`, `npm run release`, `npm run publish`). `npm start` y `npm run dev` ejecutan el servidor directamente con Node.js, sin depender de Bun.

## Arranque en Windows

- `Iniciar.cmd`: lanzador de doble clic. Delega en `mise dev` y, si Mise no está instalado, cae a `node scripts/provider.mjs`.
- `mise dev` o `npm start`: arranque desde la terminal.

## Arranque en Linux

`linux-service.example` es la plantilla de unidad systemd. Ajústala antes de instalarla: `WorkingDirectory` debe apuntar a la ruta real del repositorio y `AGY_BINARY` a la ruta real de la CLI.

El servicio usa `node scripts/provider.mjs`; el puerto por defecto es el 54800, que convive con el proveedor Codex en el 54799.

## Resolución del binario de la CLI

En este orden: `GEMINI_BINARY`, `AGY_BINARY`, `%LOCALAPPDATA%\agy\bin\agy.exe`, `where agy` o `where gemini` en Windows; `~/.local/bin/agy`, `~/.local/bin/gemini`, `/usr/local/bin/agy`, `/usr/local/bin/gemini` y `which` en Linux. Si nada coincide, se usa `~/.local/bin/agy`.

`mise check` informa de la ruta resuelta y de si el archivo existe.

## Configuración local

| Variable | Efecto |
| --- | --- |
| `LOCAL_IMAGE_DATA_DIR` | Directorio de trabajo (lotes, trabajos, referencias, configuración). Por defecto `data/`. |
| `LOCAL_IMAGE_OUTPUT_DIR` | Directorio de imágenes generadas. Por defecto `generated/`. |
| `LOCAL_IMAGE_ALLOWED_ORIGINS` | Orígenes permitidos separados por comas; sustituye a la configuración guardada. |
| `GEMINI_BINARY` / `AGY_BINARY` | Ruta explícita del ejecutable de la CLI. |

Los orígenes permitidos se guardan en `data/provider-config.json` y se editan desde el propio servicio con `GET` y `POST /api/config`. Por defecto son `http://localhost:4321`, `http://127.0.0.1:4321`, `http://localhost:4322` y `http://127.0.0.1:4322`.

## Datos y Git

`data/`, `generated/`, `node_modules/` y `.env` quedan fuera de Git. Los lotes, las referencias y las imágenes existentes se conservan; no se borran al reiniciar el servicio.

## Publicación

El proyecto es una utilidad complementaria sin mantenimiento activo: no hay canal de publicación automatizado.

- `mise publish --check` informa de rama, cambios sin confirmar, tag esperado, remoto y disponibilidad de la CLI de GitHub. No escribe ni publica.
- `mise publish --plan` muestra los pasos de una publicación manual. No los ejecuta.
- Sin `--check` ni `--plan`, la tarea se niega a publicar y termina con código 1.

Publicar exige autorización expresa, un tag explícito y una acción manual; `release` nunca publica.

## Diagnóstico

- `mise check` es la primera comprobación: si el binario no aparece o los orígenes son inválidos, el problema está ahí.
- Un trabajo que queda `paused` tras reiniciar el servicio es el comportamiento previsto: revisa el lote y reanúdalo.
- Si el generador no está listo, el servicio responde con un error de sesión y la cola queda intacta.
- Los fallos generalizables se documentan en [troubleshooting de Core](../../Docs/troubleshooting/README.md) y se enlazan desde aquí.
