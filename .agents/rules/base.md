---
trigger: always_on
---

# Instrucciones del proyecto — Aurora-Gemini-Provider

## Documentación Core — entrada compartida

Consultar primero [Documentación Core](../../../Docs/README.md) y seleccionar solo los módulos pertinentes. Los estándares compartidos se mantienen allí; este archivo conserva el alcance y los contratos específicos del proyecto.

- [Calidad y entrega proporcionales](../../../Docs/global/quality/quality-baseline.md): build para ajustes visuales pequeños; pruebas pertinentes para elementos, lógica o páginas nuevos y cambios grandes; revisión acotada para documentación.
- [Procesos según alcance](../../../Docs/global/documentation/process-workflow.md): no añadir fases, archivos ni nuevas aprobaciones por rutina a ajustes pequeños ya autorizados.
- [Comandos mediante Mise](../../../Docs/global/architecture/mise-command-standard.md): la interfaz de comandos es `mise dev|build|check|test|release|publish`; `--plan` no ejecuta ni escribe y `--check` solo lee.
- [Scripts y alias de comandos](../../../Docs/global/architecture/command-scripts-standard.md): los scripts de `package.json` delegan en `scripts/mise-task.ts`; no reimplementan la tarea.
- [Organización de proyectos y carpetas](../../../Docs/global/architecture/project-structure.md): `scripts/` para la implementación, `docs/` para los contratos y el mapa local.
- [Modelos de IA](../../../Docs/features/ai-models/README.md): el motor es la CLI local `agy` / `gemini`; no hay catálogo de modelos en estas reglas.
- [Base de lanzamientos](../../../Docs/global/releases/release-baseline.md) y [protocolo de lanzamiento](../../../Docs/global/releases/protocolo_lanzamiento_actualizacion.md): `release` prepara en local y nunca publica; `publish` exige autorización expresa.
- [Textos de interfaz](../../../Docs/global/design/interface-writing.md): aplica a los mensajes de la API y a los textos entregados al usuario final.
- [Diagnósticos reutilizables](../../../Docs/troubleshooting/README.md) y [promoción a Core](../../../Docs/global/documentation/core-promotion-workflow.md): documentar en Core los fallos confirmados o aprendizajes generalizables y enlazarlos desde el proyecto; mantener locales los detalles exclusivos.
- [Estilo de comunicación](../../../Docs/global/agents/communication-style.md): Scientific Elegant en los informes de trabajo; el resultado va primero.

En estos criterios comunes, aplicar las bases vigentes enlazadas en lugar de copias históricas de este archivo. Respetar la dirección actual de Biglex y los contratos específicos del producto; ante una contradicción, comprobar la implementación vigente y resolverla explícitamente. Las skills generales importadas son apoyo técnico, no una autoridad para redefinir estas reglas.

Excepciones: [soporte oficial](../../../Docs/features/official-support/official-support-baseline.md) y [sistema de diseño](../../../Docs/global/design/design_system.md) no aplican: el proyecto es un servicio local sin interfaz gráfica y sin publicación pública.

## Alcance del proyecto

Proveedor personal de imágenes para Aurora, impulsado por la CLI de Gemini / Antigravity (`agy` / `gemini`) ya autenticada en el equipo o en el servidor. Sin claves API externas ni facturación por tokens de imagen. Servicio técnico del ecosistema: sin instalador propio y sin interfaz gráfica.

## Contratos locales

- Servidor Node.js en loopback `127.0.0.1:54800`; el puerto 54800 convive con el proveedor Codex en el 54799 y está registrado en Aurora. No cambiarlo ni publicarlo sin petición explícita.
- Motor: CLI `agy` / `gemini` del mismo usuario, en orden de resolución `GEMINI_BINARY`, `AGY_BINARY`, `%LOCALAPPDATA%\agy\bin\agy.exe`, `where agy|gemini`, `~/.local/bin/agy|gemini`, `/usr/local/bin/agy|gemini`, `which`. La generación usa `--dangerously-skip-permissions` sobre la sesión propia: no leer, copiar, mostrar ni guardar tokens, y no sustituir la generación por llamadas con API key.
- Solo peticiones con `Host` propio (`127.0.0.1:<puerto>` o `localhost:<puerto>`) y con origen propio o permitido; en caso contrario `403`.
- Una generación por vez: un lote activo bloquea los siguientes y la cola admite tres pendientes; al reiniciar, los lotes en curso pasan a `paused` con sus elementos en `interrupted`.
- Límites: prompt de 20 000 caracteres, cuerpo JSON de 128 KiB, referencia de 12 MB (PNG, JPG o WebP estático, hasta 32 megapíxeles), cinco referencias por trabajo, lotes de hasta 30 elementos; proporciones `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`, `9:21` y salida de lado mayor 1024 o 2048.
- Papeles de referencia: `base` (única y primera), `identity`, `outfit`, `pose`, `style` y `background`. Los lotes de expresiones conservan las referencias de identidad originales.
- Datos: `data/` (lotes, trabajos, referencias, `provider-config.json`, `server.pid.json`) y `generated/`, redireccionables con `LOCAL_IMAGE_DATA_DIR` y `LOCAL_IMAGE_OUTPUT_DIR`. `data/`, `generated/`, `node_modules/` y `.env` quedan fuera de Git. Conservar los datos y las imágenes existentes.
- Orígenes permitidos: hasta ocho, guardados en `data/provider-config.json` y editables con `GET` y `POST /api/config`; por defecto `http://localhost:4321`, `http://127.0.0.1:4321`, `http://localhost:4322` y `http://127.0.0.1:4322`.
- La imagen generada se localiza en el directorio `brain` de Antigravity (`~/.gemini/antigravity-cli/brain`, `~/.gemini/antigravity/brain`, `%LOCALAPPDATA%\gemini\brain`) con el prefijo `gemini_job_<id>`.
- Distinguir una prueba de cola de una generación real: los lotes y las imágenes solo se crean al invocar la CLI.

## Decisiones locales

- Interfaz de comandos: Mise. `mise.toml` declara `dev`, `build`, `check`, `test`, `release` y `publish` sobre un único despachador, `scripts/mise-task.ts`. `release` no publica y `publish` no publica sin autorización expresa.
- `Iniciar.cmd` se conserva como lanzador de doble clic en Windows: delega en `mise dev` y usa Node.js como respaldo. Está documentado en el README.
- Los alias de `package.json` delegan en el despachador; `npm start` y `npm run dev` ejecutan el servidor con Node.js.
- Distribución: el servicio se distribuye como código, sin empaquetado ni instalador. `.gitignore` excluye `data/`, `generated/`, `node_modules/`, `.env` y `AuroraGeminiProvider.exe`.
- Publicación: no hay canal automatizado. `mise publish --check` verifica en solo lectura y `mise publish --plan` muestra el plan; la publicación es manual y exige autorización expresa.
- Pruebas: `scripts/provider.test.mjs` cubre los módulos puros (límites, papeles de referencia, proporciones, cuerpo de la petición y orígenes). Se ejecuta con `mise test` o `npm test`.

## Documentación local

- [API.md](../../API.md): contrato HTTP del servicio.
- [docs/architecture.md](../../docs/architecture.md): mapa de módulos, flujo de generación, cola y límites.
- [docs/operations.md](../../docs/operations.md): requisitos, tareas, arranque por plataforma, configuración y política de publicación.
