# Registro de Cambios (Changelog) - MAXential Thinking MCP

## Versión 2.3.1 - Optimización de Confiabilidad y Compatibilidad Multiplataforma (Windows / Linux)

### Resumen de los Cambios Realizados

1. **Reemplazo del motor de Base de Datos (`better-sqlite3` ➡️ `sql.js`)**
   - **¿Qué se hizo?**: Se eliminó la dependencia `better-sqlite3` y se sustituyó por `sql.js` (SQLite compilado a JavaScript / WebAssembly puro).
   - **¿Por qué se hizo?**: `better-sqlite3` requiere compilar código C++ nativo durante la instalación. En sistemas Windows (incluyendo Windows 11 con Hermes Desktop), esto provocaba fallos de instalación a menos que el usuario tuviese instaladas las herramientas de compilación de Visual Studio C++ (un paquete de más de 6 GB). Con `sql.js`, el paquete funciona inmediatamente al instalar en **Windows, Linux y macOS sin requerir compiladores**.
   - **Pros:**
     - 100% libre de errores de compilación nativa en Windows.
     - Facilidad de instalación con `npm install` o `npx`.
     - Archivos `.db` totalmente compatibles con el estándar SQLite.
   - **Contras:**
     - En bases de datos extremadamente grandes (cientos de miles de filas), la velocidad de lectura/escritura en JS puro puede ser ligeramente menor que en C++. Para el volumen normal de cadenas de pensamiento de AI, la diferencia es imperceptible.
   - **Opciones alternativas si se quiere cambiar:**
     - Si en el futuro se necesitara rendimiento extremo en Linux/servidor, se podría reintroducir `better-sqlite3` como dependencia opcional o usar una solución como `@vscode/sqlite3`.

2. **Resolución de Rutas de Archivos para Windows y Linux (`resolveDbPath`)**
   - **¿Qué se hizo?**: Se actualizó la función de resolución de rutas en `src/persistence.ts`.
   - **¿Por qué se hizo?**: Anteriormente se asumía que el usuario siempre estaba en Linux/Mac y solo se revisaba `process.env.HOME`. En Windows, la carpeta personal del usuario se almacena en `process.env.USERPROFILE` o `%LOCALAPPDATA%`.
   - **Cambios exactos:**
     - Soporte para `process.env.USERPROFILE` cuando la ruta comienza con `~` en Windows.
     - Normalización de rutas con `path.resolve()` y `path.join()`, garantizando el uso correcto de las barras inclinadas (`\` en Windows, `/` en Linux).
     - Manejo seguro de la creación de directorios con `try/catch` para evitar fallos por falta de permisos.

3. **Aislamiento Automático por Proyecto**
   - **¿Qué se hizo?**: Por defecto, la base de datos se guarda en `.maxential/thinking.db` dentro del directorio de trabajo actual (`process.cwd()`).
   - **¿Por qué se hizo?**: Al usar Hermes Agent, cada proyecto se ejecuta dentro de su propio espacio de trabajo. Guardar los pensamientos en `.maxential/thinking.db` dentro de la carpeta del proyecto asegura que los datos de un proyecto nunca se mezclen con los de otro. Si mueves la carpeta del proyecto en Windows o Linux, los pensamientos se mueven automáticamente con ella.

4. **Documentación Completa de Hermes Agent**
   - **¿Qué se hizo?**: Se creó el archivo `docs/documentacion-hermes.md` con información oficial recopilada de Context7 (`/nousresearch/hermes-agent`).
   - **Contenido**: Explica en detalle cómo Hermes organiza perfiles, espacios de trabajo, variables de entorno, depuración y configuración de servidores MCP en `config.yaml`.

---

## Guía de Solución de Problemas (Troubleshooting)

### Si la base de datos no se guarda o no se encuentra:
1. Revisa la variable de entorno `MAXENTIAL_DB_PATH`.
2. En Windows, puedes especificar una ruta directa usando:
   `MAXENTIAL_DB_PATH="C:\MisBasesDeDatos\mis_pensamientos.db"`
3. Si la ruta especificada utiliza `~`, asegúrate de que `%USERPROFILE%` o `$HOME` estén definidos correctamente en tu terminal o configuración de Hermes.
