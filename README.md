# 🌌 Aurora Gemini Provider

> [!NOTE]
> **Herramienta utilitaria personal · Sin mantenimiento activo**  
> Este repositorio es una utilidad complementaria sin mantenimiento activo ni desarrollo continuo. Se publica como referencia y herramienta para quien desee conectar su suscripción o sesión activa de Gemini / Antigravity CLI (`agy` / `gemini`) en este equipo o servidor, permitiendo generar imágenes dentro del ecosistema Aurora sin necesidad de claves de API externas ni cobros por token de imagen.

Proveedor personal de síntesis visual e inferencia de imágenes para el ecosistema Aurora, impulsado por Gemini / Antigravity CLI (`agy` / `gemini`).
Aprovecha la sesión autenticada existente en este equipo o en el servidor Linux, sin requerir claves API externas ni facturación adicional por tokens de imagen.


---

## ✨ Características

- 📐 **Encuadre y Aspect Ratio**: Soporte nativo para proporciones cinematográficas y estándares: `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `21:9`, `9:21`.
- 🎭 **Referencias y Roles Visuales**: Condicionamiento visual con roles contextuales (`base`, `identity`, `outfit`, `pose`, `style`).
- 🔍 **Resoluciones Altas**: Generación a resoluciones nítidas `1024` y `2048`.
- 📦 **Lotes y Expresiones**: Generación secuencial de expresiones faciales con preservación consistente de identidad.
- ⚡ **Portabilidad Nativa**: Detección automática del binario `agy.exe` en Windows y `agy` en Linux.
- 🌐 **Contrato HTTP REST**: Compatible con la especificación de proveedores de imagen de Aurora (`/v1/*`).

---

## 🚀 Inicio Rápido

### Requisitos previos
- Node.js 20.9 o superior.
- Sesión iniciada con la CLI de Gemini / Antigravity (`agy` o `gemini`).

### Instalación
```bash
npm install
```

### Ejecución en Windows
1. Haz doble clic en `Iniciar.cmd` o ejecuta en la terminal:
   ```powershell
   npm start
   ```
2. El servidor escucha por defecto en `http://127.0.0.1:54800`.
3. Comprobación de sintaxis:
   ```powershell
   npm run check
   ```

### Ejecución en Linux (Servicio systemd)
Consulta la plantilla de configuración en [linux-service.example](linux-service.example).

---

## 📡 API y Contrato HTTP

Consulta [API.md](API.md) para el detalle de endpoints, subida de referencias visuales multipart y control del ciclo de vida de los trabajos de generación.

---

## 📜 Licencia

Distribuido bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
