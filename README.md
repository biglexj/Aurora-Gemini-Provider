# 🌌 Aurora Gemini Provider

> [!NOTE]
> **Herramienta utilitaria personal · Sin mantenimiento activo**  
> Este repositorio es una utilidad complementaria sin mantenimiento activo ni desarrollo continuo. Se publica como referencia y herramienta para quien desee conectar su suscripción o sesión activa de Gemini / Antigravity CLI (`agy` / `gemini`) en este equipo o servidor, permitiendo generar imágenes dentro del ecosistema Aurora sin necesidad de claves de API externas ni cobros por token de imagen.

Proveedor personal de síntesis visual e inferencia de imágenes para el ecosistema Aurora, impulsado por Gemini / Antigravity CLI (`agy` / `gemini`).
Aprovecha la sesión autenticada existente en este equipo o en el servidor Linux, sin requerir claves API externas ni facturación adicional por tokens de imagen.


---

## ✨ Características

- 📐 **Encuadre y Aspect Ratio**: Soporte nativo para proporciones cinematográficas y estándares: `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`, `9:21`.
- 🎭 **Referencias y Roles Visuales**: Condicionamiento visual con roles contextuales (`base`, `identity`, `outfit`, `pose`, `style`, `background`).
- 🔍 **Resoluciones Altas**: Generación a resoluciones nítidas `1024` y `2048`.
- 📦 **Lotes y Expresiones**: Generación secuencial de expresiones faciales con preservación consistente de identidad.
- ⚡ **Portabilidad Nativa**: Detección automática del binario `agy.exe` en Windows y `agy` en Linux.
- 🌐 **Contrato HTTP REST**: Compatible con la especificación de proveedores de imagen de Aurora (`/v1/*`).
- 🔒 **Solo local**: Escucha en loopback (`127.0.0.1:54800`) y acepta únicamente su propio host y los orígenes configurados.

---

## 🚀 Inicio Rápido

### Requisitos previos
- Node.js 20.9 o superior (ejecuta el servidor).
- Bun (ejecuta las tareas de Mise).
- Sesión iniciada con la CLI de Gemini / Antigravity (`agy` o `gemini`).
- Dependencia `sharp` instalada.

### Instalación
```bash
npm install
```

### Tareas del proyecto (Mise)
Mise es la entrada principal de comandos. `mise.toml` declara todas las tareas sobre un único despachador (`scripts/mise-task.ts`):

- `mise dev`: Inicia el servidor local en `http://127.0.0.1:54800`.
- `mise build`: Comprueba la sintaxis de todos los scripts y que `sharp` se resuelve, sin empaquetar.
- `mise check`: Verifica Node, `sharp`, el binario `agy`/`gemini` y los orígenes permitidos, en solo lectura.
- `mise test`: Ejecuta las pruebas unitarias de los módulos puros.

El proveedor es una utilidad local sin canal de publicación: no expone `release` ni `publish`, y esas tareas responden con un error explícito. El servicio se distribuye como código.

Opciones comunes:
- `--plan`: Muestra lo que se ejecutaría, sin ejecutar, escribir ni consultar la red.

Los alias de `package.json` delegan en el mismo despachador: `npm run build`, `npm run check` y `npm test`. `npm start` y `npm run dev` ejecutan el servidor directamente con Node.js.

### Ejecución en Windows
1. Haz doble clic en `Iniciar.cmd` o ejecuta en la terminal:
   ```powershell
   mise dev
   ```
   `Iniciar.cmd` es el lanzador de arranque con doble clic: delega en `mise dev` y, si Mise no está instalado, cae a `node scripts/provider.mjs`.
2. El servidor escucha por defecto en `http://127.0.0.1:54800`.
3. Verificación del entorno y la configuración:
   ```powershell
   mise check
   ```

### Ejecución en Linux (Servicio systemd)
Consulta la plantilla de configuración en [linux-service.example](linux-service.example).

---

## 📡 API y Contrato HTTP

Consulta [API.md](API.md) para el detalle de endpoints, subida de referencias visuales multipart y control del ciclo de vida de los trabajos de generación.

---

## 🧭 Documentación del proyecto

- [docs/architecture.md](docs/architecture.md): módulos, flujo de generación, cola y límites del contrato.
- [docs/operations.md](docs/operations.md): requisitos, tareas, arranque por plataforma y configuración.
- [API.md](API.md): contrato HTTP.

---

## 📜 Licencia

Distribuido bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
