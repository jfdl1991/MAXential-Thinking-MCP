# MAXential Thinking MCP - Plan de Mejoras de Seguridad y Confiabilidad

## Descripción General

Este documento describe todos los trabajos pendientes para hacer que MAXential sea:
- **Seguro**: Que el almacenamiento de datos funcione correctamente sin pérdidas invisibles
- **Confiable**: Que funcione igual en Windows, Mac y Linux
- **Rápido**: Usando la base de datos más eficiente para la tarea
- **Inteligente**: Que reconozca a diferentes agentes y proyectos sin confundir datos

---

## 1. RUTAS DE ARCHIVOS ROBUSTAS Y COMPATIBLES CON WINDOWS

### ¿Por qué es importante?

Actualmente el código usa `/` (barras normales) para rutas de archivo. Esto funciona en Mac y Linux, pero **Windows usa `\` (barras invertidas)**. Si un usuario en Windows intenta usar MAXential, los archivos no se crearán en el lugar correcto, y los datos se perderán silenciosamente.

**Ejemplo del problema:**
```
Mac/Linux esperado:  ~/.maxential/thinking.db
Windows actualmente: C:\Users\jose\.maxential/thinking.db  ← FALLA, ruta inconsistente
Windows que queremos: C:\Users\jose\.maxential\thinking.db
```

### Qué hay que cambiar

#### Archivo: `src/persistence.ts` - Función `resolveDbPath()`

**Cambio requerido:**
```typescript
// ANTES (línea 556-573)
export function resolveDbPath(): string {
  const envPath = process.env.MAXENTIAL_DB_PATH;
  if (envPath === ':memory:') return ':memory:';
  if (envPath) {
    if (envPath.startsWith('~')) {
      return path.join(process.env.HOME || '', envPath.slice(1));  // ← PROBLEMA
    }
    return path.resolve(envPath);
  }
  return path.join(process.cwd(), '.maxential', 'thinking.db');
}

// DESPUÉS (lo correcto)
export function resolveDbPath(): string {
  const envPath = process.env.MAXENTIAL_DB_PATH;
  if (envPath === ':memory:') return ':memory:';
  if (envPath) {
    if (envPath.startsWith('~')) {
      // En Windows, process.env.USERPROFILE es el equivalente de $HOME
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.resolve(path.join(homeDir, envPath.slice(1)));
    }
    return path.resolve(envPath);
  }
  return path.resolve(path.join(process.cwd(), '.maxential', 'thinking.db'));
}
```

**Por qué este cambio:**
- `path.join()` y `path.resolve()` detectan automáticamente si estás en Windows o Linux y usan las barras correctas
- `process.env.USERPROFILE` es el equivalente de `$HOME` en Windows
- `path.resolve()` asegura que la ruta es absoluta (completa desde la raíz del sistema)

#### Archivo: `src/persistence.ts` - Función `constructor()`

**Cambio requerido (línea 140-147):**
```typescript
// ANTES
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// DESPUÉS - Más seguro
const dir = path.dirname(dbPath);
if (dir && dir !== ':memory:' && !fs.existsSync(dir)) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Cannot create database directory: ${dir}. Check folder permissions.`
    );
  }
}
```

**Por qué este cambio:**
- Evita intentar crear carpetas en rutas inválidas
- Da un mensaje claro si no hay permisos de escritura (muy común en Windows)
- Maneja la ruta `:memory:` (en-memoria) sin intentar crear nada

### Qué hay que probar

```bash
# En Linux/Mac (ya funciona, verificar que no se rompe)
export MAXENTIAL_DB_PATH="~/.maxential/thinking.db"
npm run test

# En Windows (IMPORTANTE - esto es lo que hay que verificar)
set MAXENTIAL_DB_PATH=%USERPROFILE%\.maxential\thinking.db
npm run test

# Verificar que el archivo se crea realmente en:
# C:\Users\tunombre\.maxential\thinking.db
```

---

## 2. CAMBIAR DE BETTER-SQLITE3 A SQL.JS (Base de datos en memoria + archivo)

### ¿Por qué es importante?

**Problema actual:**
- `better-sqlite3` es una librería que compila código C nativo
- Esto significa que cuando instalas el proyecto, Node.js tiene que compilar código C para tu computadora específica
- En Windows, esto **casi nunca funciona** sin que tengas herramientas especiales de compilación instaladas (Visual Studio, etc.)
- Si falla la compilación, el proyecto no funciona

**Solución:**
- `sql.js` es una librería **100% JavaScript** que funciona en cualquier lugar
- Es el mismo SQLite (la base de datos), pero compilada a JavaScript
- Es mucho más portable y fácil de instalar

### Ventajas de SQL.js

| Aspecto | better-sqlite3 | sql.js |
|--------|---|---|
| Funciona en Windows sin compilación | ❌ No (requiere VS Build Tools) | ✅ Sí |
| Funciona en Linux sin compilación | ⚠️ A veces | ✅ Sí |
| Funciona en Mac | ✅ Sí | ✅ Sí |
| Velocidad | ✅ Muy rápido | ⚠️ Algo más lento, pero aceptable |
| Portabilidad | ❌ Baja | ✅ Alta |
| Instalación fácil | ❌ Compleja | ✅ Muy simple |

### Qué cambios necesita el código

#### 1. Actualizar `package.json`

```json
{
  "dependencies": {
    // QUITAR ESTO:
    // "better-sqlite3": "^9.0.0",
    
    // AÑADIR ESTO:
    "sql.js": "^1.8.0"
  }
}
```

#### 2. Reescribir `src/persistence.ts`

El cambio es **moderado**. Las funciones principales siguen siendo iguales, pero la forma de inicializar y guardar cambia:

```typescript
// ANTES (con better-sqlite3)
import Database from 'better-sqlite3';

export class PersistenceLayer {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }
}

// DESPUÉS (con sql.js)
import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';

export class PersistenceLayer {
  private db: Database;
  private dbPath: string;
  private sqlJs: any; // la librería inicializada
  
  static async create(dbPath: string): Promise<PersistenceLayer> {
    const sqlJs = await initSqlJs();
    const instance = new PersistenceLayer();
    instance.sqlJs = sqlJs;
    instance.dbPath = dbPath;
    
    // Cargar base de datos existente o crear nueva
    if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      instance.db = new instance.sqlJs.Database(buffer);
    } else {
      instance.db = new instance.sqlJs.Database();
    }
    
    return instance;
  }
  
  save(): void {
    if (this.dbPath !== ':memory:') {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, data);
    }
  }
}
```

### ¿Por qué este cambio es seguro?

1. **Las consultas SQL son idénticas** - `INSERT`, `UPDATE`, `SELECT` funcionan exactamente igual
2. **El esquema de la base de datos no cambia** - las tablas son iguales
3. **Los datos existentes se migran automáticamente** - cuando se carga un archivo `.db` viejo, sql.js lo lee sin problemas
4. **Podemos testear localmente** - no necesitamos un database server complejo

### Dependencias a averiguar exactamente

| Dependencia | Versión | Por qué la necesitamos | Cómo verificar si funciona |
|---|---|---|---|
| sql.js | ^1.8.0 | Es la base de datos en JavaScript | `npm list sql.js` debe mostrar 1.8.0+ |
| Node.js | >=16 | sql.js necesita características modernas de JS | `node --version` debe ser v16+ |
| TypeScript | ^5.0 | Para compilar el código TypeScript | `npm list typescript` |
| Vitest | ^0.34+ | Para ejecutar tests | `npm run test` debe funcionar |

### Qué hay que probar

```bash
# 1. Instalar la dependencia nueva
npm install sql.js

# 2. Compilar el código TypeScript
npm run build

# 3. Ejecutar todos los tests (especialmente el de fail-fast)
npm run test

# 4. Verificar que se crea el archivo .db
node -e "require('./dist/index.js')" &
sleep 2
ls -la ~/.maxential/thinking.db

# 5. Cargar datos viejos (si tenemos un .db antiguo)
cp old-thinking.db test-db.db
# Cambiar MAXENTIAL_DB_PATH a test-db.db
# Ejecutar y verificar que los datos se cargan correctamente
```

---

## 3. ALMACENAMIENTO SEPARADO POR PROYECTO Y AGENTE

### ¿Por qué es importante?

**Problema actual:**
- Todos los datos de todos los agentes se guardan en **una sola base de datos**
- Si estás usando Hermes con 3 proyectos diferentes, los datos se mezclan
- Un agente podría leer la "memoria" de otro agente sin saberlo
- Esto es un problema de **seguridad e independencia**

**Solución:**
- Cada proyecto tiene su propia carpeta
- Dentro de cada proyecto, cada agente tiene su propia base de datos
- Así: `~/.maxential/proyecto-1/agente-1/thinking.db`
- Los datos nunca se mezclan

### Estructura propuesta

```
~/.maxential/
├── projects/
│   ├── proyecto-1/
│   │   ├── agentes/
│   │   │   ├── agente-main/
│   │   │   │   ├── thinking.db
│   │   │   │   └── sessions.log
│   │   │   └── agente-investigador/
│   │   │       ├── thinking.db
│   │   │       └── sessions.log
│   │   └── metadata.json
│   └── proyecto-2/
│       └── agentes/
│           └── agente-main/
│               └── thinking.db
└── config.json
```

### Cómo sería el cambio en el código

**Archivo: `src/persistence.ts`**

```typescript
export interface StoragePath {
  projectId: string;
  agentId: string;
  sessionId?: string;
}

export function resolveStoragePath(options: StoragePath): string {
  const baseDir = process.env.MAXENTIAL_DATA_DIR || 
                  path.join(process.env.HOME || process.env.USERPROFILE || '', '.maxential');
  
  const projectDir = path.join(baseDir, 'projects', options.projectId);
  const agentDir = path.join(projectDir, 'agentes', options.agentId);
  const dbPath = path.join(agentDir, 'thinking.db');
  
  return dbPath;
}
```

### ¿De dónde sacamos projectId y agentId?

**ESTO AÚN NO LO SABEMOS.**

Tenemos que averiguar:

1. ¿Hermes nos pasa un `projectId`?
   - Pregunta: Cuando Hermes llama a una herramienta MCP, ¿incluye información del proyecto?
   - Cómo verificar: Añadir logging en `src/index.ts` línea 306 para ver qué datos recibimos

2. ¿Hermes nos pasa un `agentId`?
   - Pregunta: ¿Hay algún identificador del agente en la solicitud?
   - Cómo verificar: Inspeccionar `request.params` completo

3. ¿Cómo diferenciamos agentes dentro del mismo proyecto?
   - Pregunta: ¿Cada agente tiene un nombre único?
   - Cómo verificar: Documentación de Hermes o preguntar al creador

### Qué hay que hacer para averiguarlo

```typescript
// EN src/index.ts, línea 306, temporalmente:
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error('=== DEBUG REQUEST ===');
  console.error('Full request:', JSON.stringify(request, null, 2));
  console.error('Parameters:', request.params);
  console.error('Arguments:', request.params.arguments);
  console.error('Environment:', {
    HERMES_PROJECT_ID: process.env.HERMES_PROJECT_ID,
    HERMES_AGENT_ID: process.env.HERMES_AGENT_ID,
  });
  console.error('=== END DEBUG ===');
  
  // ... resto del código
});
```

Luego ejecutar con Hermes y **capturar el output** para ver qué información está disponible.

### Qué hay que probar

```bash
# 1. Verificar que se crean las carpetas correctas
HERMES_PROJECT_ID="mi-proyecto" HERMES_AGENT_ID="agente-1" npm start

# 2. Verificar la estructura de carpetas
ls -la ~/.maxential/projects/mi-proyecto/agentes/agente-1/

# 3. Cambiar proyecto y verificar que se usa otra BD
HERMES_PROJECT_ID="otro-proyecto" HERMES_AGENT_ID="agente-1" npm start

# 4. Verificar que los datos son independientes
# Añadir un pensamiento en proyecto 1
# Cambiar a proyecto 2
# Verificar que el proyecto 2 está vacío
```

---

## 4. MIGRACIÓN SEGURA DE DATOS

### ¿Por qué es importante?

Cuando changamos de `better-sqlite3` a `sql.js` y de una BD única a BDs por proyecto, los datos viejos podrían perderse si no tenemos un plan.

### Plan de migración

#### Paso 1: Detectar datos viejos
```typescript
export function hasSqliteData(path: string): boolean {
  // Verificar si existe un archivo .db viejo
  return fs.existsSync(path) && path.endsWith('.db');
}
```

#### Paso 2: Crear carpeta de backup
```typescript
export function backupOldData(oldPath: string): string {
  const backupPath = `${oldPath}.backup.${Date.now()}`;
  fs.copyFileSync(oldPath, backupPath);
  console.error(`✅ Datos antiguos guardados en: ${backupPath}`);
  return backupPath;
}
```

#### Paso 3: Migrar datos
```typescript
export async function migrateToNewStructure(
  oldDbPath: string,
  projectId: string,
  agentId: string
): Promise<void> {
  const newDbPath = resolveStoragePath({ projectId, agentId });
  const newDir = path.dirname(newDbPath);
  
  // Crear carpetas
  fs.mkdirSync(newDir, { recursive: true });
  
  // Copiar/convertir base de datos
  const oldDb = new Database(oldDbPath);
  const newDb = await sql.js.Database.create();
  
  // Copiar esquema
  // ...
}
```

### Qué hay que probar

```bash
# 1. Crear una BD vieja
npm run test:legacy

# 2. Ejecutar migración
npm run migrate

# 3. Verificar que los datos se copiaron correctamente
npm run test:migration
```

---

## 5. RESUMEN DE TAREAS POR PRIORIDAD

### 🔴 CRÍTICO (Hacer primero)

| Tarea | Archivo | Razón | Estimado |
|-------|---------|-------|----------|
| Rutas Windows compatible | `src/persistence.ts` | Sin esto, no funciona en Windows | 1 hora |
| Test fail-fast | `__tests__/fail-fast.test.ts` | Verificar que errores se reportan | 1 hora |
| Cambiar a sql.js | `package.json`, `src/persistence.ts` | Sin esto, instalación falla en Windows | 4 horas |
| Averiguar projectId/agentId | Documentación Hermes | Necesitamos esto para separar datos | 2 horas |

### 🟡 IMPORTANTE (Hacer después)

| Tarea | Archivo | Razón | Estimado |
|-------|---------|-------|----------|
| Almacenamiento por proyecto | `src/persistence.ts` | Seguridad e independencia de datos | 3 horas |
| Sistema de migración | `src/migration.ts` | Proteger datos viejos | 2 horas |
| Tests de migración | `__tests__/migration.test.ts` | Verificar que no se pierden datos | 2 horas |

### 🟢 DESEABLE (Hacer al final)

| Tarea | Archivo | Razón | Estimado |
|-------|---------|-------|----------|
| Optimizar rendimiento sql.js | `src/lib.ts` | Si es lento | 2 horas |
| Documentación para usuarios | `docs/` | Explicar cómo usar | 1 hora |
| Dashboard de sesiones | `src/dashboard.ts` | Interfaz amigable | 4 horas |

---

## 6. PREGUNTAS PENDIENTES QUE DEBEMOS RESPONDER

### Sobre Hermes
- [ ] ¿Hermes nos pasa `projectId` en cada solicitud? ¿Cómo?
- [ ] ¿Hermes nos pasa `agentId`? ¿Es constante por ejecución?
- [ ] ¿Hay variables de entorno que Hermes configura automáticamente?
- [ ] ¿Hermes reinicia el servidor MCP para cada proyecto o reutiliza el mismo?

### Sobre Performance
- [ ] ¿sql.js es lo suficientemente rápido para 1000+ pensamientos?
- [ ] ¿Necesitamos caché en memoria además de la BD?
- [ ] ¿Cómo de frecuente es la escritura a disco?

### Sobre Compatibilidad
- [ ] ¿Qué versiones de Node.js soportan mejor sql.js?
- [ ] ¿Hay diferencias entre Windows 10/11 y WSL2?
- [ ] ¿Qué ocurre con permisos de archivo en sistemas corporativos?

---

## 7. CHECKLIST DE VERIFICACIÓN

Cuando termines cada tarea, verifica:

```
RUTAS WINDOWS:
☐ Se crea carpeta en Windows con barras invertidas correctas
☐ Se crea carpeta en Linux/Mac con barras normales correctas
☐ Funciona con ~ en la ruta
☐ Funciona con rutas absolutas
☐ Maneja permisos insuficientes con mensaje claro

SQL.JS:
☐ npm install funciona sin errores
☐ npm run build compila sin errores
☐ npm run test pasa todos los tests
☐ El archivo .db se crea correctamente
☐ Se puede abrir un .db antiguo (migración)
☐ El rendimiento es aceptable (< 1s para 100 pensamientos)

SEPARACIÓN POR PROYECTO:
☐ Se crean carpetas por proyecto
☐ Se crean carpetas por agente
☐ Dos proyectos no comparten datos
☐ Dos agentes en el mismo proyecto no comparten datos
☐ Los datos viejos se migran correctamente

HERMES INTEGRATION:
☐ Identificamos dónde viene projectId
☐ Identificamos dónde viene agentId
☐ Hacemos logging de valores recibidos
☐ Verificamos que se usan correctamente
```

---

## 8. CÓMO PROCEDER PASO A PASO

### Semana 1: Compatibilidad Base
1. Lunes-Martes: Rutas Windows compatible + tests
2. Miércoles-Jueves: Cambio a sql.js
3. Viernes: Migración de datos viejos

### Semana 2: Separación por Proyecto
1. Lunes: Averiguar projectId/agentId desde Hermes
2. Martes-Miércoles: Implementar almacenamiento separado
3. Jueves-Viernes: Tests exhaustivos

### Semana 3: Pulido
1. Lunes-Martes: Optimización de performance
2. Miércoles-Jueves: Documentación
3. Viernes: Release

---

## 9. NOTAS IMPORTANTES

### ⚠️ Riesgos conocidos

1. **sql.js puede ser más lento**: Si tenemos muchísimos datos (100K+ pensamientos), podría ser lento. Solución: implementar paginación.

2. **Cambio de mejor-sqlite3 a sql.js es un punto de no retorno**: Si alguien tiene código que usa `better-sqlite3` directamente, se romperá. Pero como esto es un servidor MCP, los usuarios no acceden a la BD directamente.

3. **Hermes podría no proporcionar projectId/agentId**: Si es así, tendremos que usar valores por defecto (por ejemplo, "default" para ambos).

4. **Migración de datos podría fallar**: Es importante tener backups automáticos.

### ✅ Lo que ya hicimos bien

1. El test de fail-fast ya está en lugar (✓)
2. El logging ya mejoramos (✓)
3. El error handling es explícito (✓)
4. Tenemos todo documentado en este archivo

### 📝 Próximo documento

Cuando termines este plan, crea un documento `IMPLEMENTATION-PROGRESS.md` con:
- Qué tareas completaste
- Qué problemas encontraste
- Qué tuviste que cambiar del plan original
- Resultados de tests

---

**Última actualización:** 2026-10-07  
**Estado:** Documento de referencia - En implementación  
**Responsable:** jfdl1991 (equipo de desarrollo)
