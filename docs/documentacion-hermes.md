# Documentación Oficial de Hermes Agent para Servidores MCP

**Fecha de consulta:** 2026-10-07
**Fuente:** Documentación Oficial de Nous Research (Hermes Agent & Hermes Desktop) via Context7 (`/nousresearch/hermes-agent` y `/websites/hermes-agent_nousresearch_developer-guide`).

---

## 1. Visión General e Integración con MCP

Hermes Agent es un agente de IA de código abierto creado por **Nous Research**. Cuenta con ejecución local de comandos, gestión de contexto y soporte para **MCP (Model Context Protocol)**.

Los servidores MCP en Hermes actúan como procesos secundarios (subprocessos `stdio` o servicios HTTP/SSE) que exponen herramientas adicionales que el agente puede invocar libremente durante una conversación.

---

## 2. Jerarquía del Sistema de Archivos y Estructura en Disco

Hermes organiza sus datos en tres niveles principales: **Perfiles (Profiles)**, **Espacios de Trabajo (Workspaces)** y **Sesiones (Sessions)**.

### A. Perfiles (Profiles)
- Cada perfil representa un entorno/instancia aislada de Hermes.
- **Ruta por defecto:**
  - **Linux / macOS:** `~/.hermes/`
  - **Windows 11:** `%USERPROFILE%\.hermes\` o `%LOCALAPPDATA%\hermes\` (definido por la variable de entorno `HERMES_HOME`).
- **Contenido del directorio de perfil (`HERMES_HOME`):**
  - `config.yaml`: Configuración global y registro de servidores MCP.
  - `.env`: Variables de entorno específicas del perfil.
  - `SOUL.md`: Instrucciones del sistema y personalidad del agente.
  - `state.db`: Base de datos SQLite del perfil donde se guardan todas las conversaciones y transcripciones.
  - `plugins/`: Plugins personalizados de Python.

### B. Espacios de Trabajo (Workspaces / Projects)
- Es el directorio raíz de desarrollo donde se ejecutan los comandos de terminal y las herramientas de proyecto.
- Se configura independientemente del perfil usando `terminal.cwd` en `config.yaml` o mediante la variable `${workspaceFolder}`.
- Cuando se lanza una tarea desde la interfaz de Hermes Desktop o CLI en una carpeta concreta, el proceso del MCP hereda ese directorio como su directorio de trabajo actual (`process.cwd()`).

### C. Sesiones y Conversaciones (Sessions)
- Cada conversación dentro de un proyecto tiene su propio `session_id` único.
- El historial de mensajes se almacena en `state.db` dentro del perfil activo (`$HERMES_HOME/state.db`).
- Las reconstrucciones del agente mid-session conservan el identificador de sesión y el perfil asociado.

---

## 3. Configuración de Servidores MCP en Hermes (`config.yaml`)

Los servidores MCP se declaran en el archivo `config.yaml` del perfil de Hermes dentro de la clave `mcp_servers`:

```yaml
mcp_servers:
  maxential-thinking:
    command: "npx"
    args: ["-y", "@bam-devcrew/maxential-thinking-mcp"]
    cwd: "${workspaceFolder}"
    env:
      MAXENTIAL_DB_PATH: "${workspaceFolder}${/}.maxential${/}thinking.db"
    timeout: 120
    enabled: true
```

### Variables de Contexto Soportadas en Hermes:
- `${workspaceFolder}`: Ruta absoluta del proyecto actual.
- `${userHome}`: Directorio home del usuario (`~` o `%USERPROFILE%`).
- `${/}`: Separador de rutas nativo del sistema operativo (`\` en Windows, `/` en Linux/macOS).
- `${VAR}` / `${env:VAR}`: Mapeo de cualquier variable de entorno del sistema.

### Seguridad y Paso de Variables de Entorno:
Hermes **filtra y aísla** las variables de entorno que pasan a los servidores MCP por razones de seguridad. Solo transfiere:
- Variables explicitly definidas dentro del bloque `env:` en `config.yaml`.
- Variables del sistema como `PATH`, `HOME`, `USERPROFILE`, `XDG_*`, `TMP`, `TEMP`.

---

## 4. Comportamiento en Windows 11 (Hermes Desktop) vs Linux

| Aspecto | Windows 11 (Hermes Desktop) | Linux / macOS |
| :--- | :--- | :--- |
| **Separador de rutas** | Backslash (`\`) | Forward slash (`/`) |
| **Variable de Directorio Home** | `%USERPROFILE%` / `%LOCALAPPDATA%` | `$HOME` / `~` |
| **Compilación de C++** | Requiere Visual Studio Build Tools si se usan módulos C nativos (como `better-sqlite3`). | Suele requerir `build-essential` o `python3/make`. |
| **Solución JS pura (`sql.js`)** | Funciona de inmediato sin necesidad de compilación nativa ni herramientas extra. | Funciona de inmediato sin dependencias del sistema. |

---

## 5. Guía para Desarrollo, Testing y Debugging del MCP

### Modo Depuración de Plugins y MCP en Hermes:
Para ver los logs detallados de cómo Hermes descubre y conecta los servidores MCP:

```bash
# En Linux / macOS
HERMES_PLUGINS_DEBUG=1 hermes logs --level DEBUG

# En Windows (PowerShell / CMD)
$env:HERMES_PLUGINS_DEBUG="1"; hermes logs --level DEBUG
```

### Ubicación de Logs de Hermes:
- **Windows:** `%LOCALAPPDATA%\hermes\logs\`
- **Linux/macOS:** `~/.hermes/logs/`

---

## 6. Conclusiones y Decisiones de Diseño para MAXential MCP

1. **Uso de `sql.js` (WebAssembly/JS puro):** Elimina cualquier fallo de instalación en Windows 11 al evitar la compilación de `better-sqlite3`.
2. **Soporte de Rutas Nativas con `path.resolve()` y `path.join()`:** Permite manejar correctamente tanto rutas de Windows (`C:\...`) como de Linux (`/...`), respetando `%USERPROFILE%` y `$HOME`.
3. **Aislamiento por Proyecto Automático:** Al utilizar `process.cwd()`, la base de datos se ubica por defecto en `.maxential/thinking.db` dentro de la carpeta del proyecto que Hermes asigna mediante `${workspaceFolder}`.
