# @lagless/codegen

## 1. Responsibility & Context

Code generator that transforms YAML schema definitions into TypeScript ECS (Entity Component System) classes for Lagless simulations. Reads declarative schema files describing components, singletons, filters, inputs, and player resources, then generates type-safe TypeScript classes with deterministic memory layouts, input registries, core modules, and ECSRunner subclasses. Eliminates boilerplate and ensures consistency across ECS projects.

## 2. Architecture Role

**Upstream dependencies:** `@lagless/binary`, `@lagless/core`
**Downstream consumers:** `circle-sumo-simulation` (uses generated code from `ecs.yaml`)

This tool sits outside the runtime dependency graph — it's a build-time/development-time code generator. Generated code depends on `@lagless/core` and `@lagless/binary`, but the generator itself is not imported by applications. Integrates with Nx workspace generators for monorepo workflows.

## 3. Public API

### Parser

- **`parseYamlConfig(configContent: string, configPath?: string): { schema: ECSSchema, projectName: string }`** — Parse YAML config string into `ECSSchema` object. `projectName` extracted from YAML `projectName:` field or derived from `configPath` (e.g., `circle-sumo/...` → `CircleSumo`). Throws on invalid schema.

- **`parseFieldType(typeStr: string): FieldDefinition`** — Parse field type string (e.g., `"float32"`, `"uint8[16]"`) into `FieldDefinition` with `{ type, isArray, arrayLength? }`. Used internally by schema parser.

- **`parseInputFieldType(fieldName: string, fieldType: string): InputFieldDefinition`** — Parse input field with byte length calculation. Returns `{ name, type, isArray, arrayLength?, byteLength }`.

- **`getProjectNameFromConfigPath(configPath: string): string`** — Extract project name from file path. Converts kebab-case to PascalCase (e.g., `circle-sumo/ecs.yaml` → `CircleSumo`).

### Generator

- **`generateCode(options: GenerateCodeOptions): Promise<void>`** — Main code generation entry point. Generates all TypeScript classes (components, singletons, filters, inputs, player resources, input registry, core module, runner class, barrel export file) from schema.
  - Options: `{ schema, projectName, outputDir, templateDir, fileOperations }`

- **`generateBarrelFileContent(schema: ECSSchema, projectName: string): string`** — Generate barrel export file (`index.ts`) content that re-exports all generated classes.

### Template Engine

- **`generateFromTemplate(options: TemplateOptions): Promise<void>`** — Render EJS templates from `templateDir` to `outputDir` with provided `data`. Processes `.template` files and `__variable__` filename patterns.
  - Options: `{ templateDir, outputDir, data, fileOperations }`

- **`TemplateEngine`** — Class-based template engine. Use `generateFromTemplate()` function for simpler usage.

### Types

- **`ECSConfig`** — YAML schema interface with optional fields: `projectName`, `components`, `singletons`, `playerResources`, `filters`, `inputs`

- **`GenerateCodeOptions`** — Generator function options: `schema`, `projectName`, `outputDir`, `templateDir`, `fileOperations`

- **`FileOperations`** — Abstraction for file I/O operations. Allows generator to work with Node.js `fs` module (CLI) or Nx `Tree` API (workspace generators).
  - Methods: `readFile`, `writeFile`, `joinPath`, `exists`, `readDir?`, `isDirectory?`

## 4. Preconditions

- **YAML schema file exists** at the specified config path (e.g., `src/lib/schema/ecs.yaml`)
- **Schema must contain at least one of:** `components` or `singletons` (cannot be empty)
- **Template files exist** in the specified template directory (default: `tools/codegen/files/`)
- **Output directory is writable** (generator creates it if missing)
- **For Nx generator:** Nx workspace initialized with `@lagless/codegen` in dependencies

## 5. Postconditions

- **Generated TypeScript files** in the output directory (default: `<config_dir>/../code-gen/`)
- **Component classes** with SoA memory layout for each component in schema
- **Singleton classes** with typed array accessors for singleton fields
- **Filter classes** with bitmask matching logic for entity iteration
- **Input classes** with binary serialization/deserialization methods
- **PlayerResource classes** with per-player state management
- **Input registry** mapping input IDs to input classes
- **Core module** (`<ProjectName>.core.ts`) with `getECSSchema()` function
- **Runner class** (`<ProjectName>.runner.ts`) extending `ECSRunner` with schema integration
- **Barrel export** (`index.ts`) re-exporting all generated classes
- All files formatted and ready for use in ECS simulation

## 6. Invariants & Constraints

- **Component IDs are powers of 2** — `id = 2^n` where `n` is the component's index in the YAML file. Required for bitmask filtering (e.g., first component = 1, second = 2, third = 4, etc.).
- **Input IDs start at 1** — Sequential integers (not powers of 2). First input = 1, second = 2, etc.
- **Field type strings** must match `@lagless/binary` supported types: `uint8`, `uint16`, `uint32`, `int8`, `int16`, `int32`, `float32`, `float64`
- **Array syntax:** `type[length]` where `length > 0` (e.g., `uint8[16]` for 16-byte UUID)
- **Project name** must be valid TypeScript identifier (PascalCase recommended)
- **Filter include/exclude** component names must exist in the `components:` section
- **Template files** use EJS syntax (`<%= variable %>`, `<% if (condition) { %>...`)
- **Output is deterministic** — Same YAML input always produces identical TypeScript output (important for version control)

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT** modify component ID calculation logic — changing from powers of 2 breaks bitmask filtering in `@lagless/core`
- **DO NOT** add unsupported field types — only types in `@lagless/binary` `typeToArrayConstructor` are valid
- **DO NOT** change template file structure without updating `generateCode()` logic — generator assumes specific template directory layout (`component/`, `singleton/`, `filter/`, etc.)
- **DO NOT** generate code directly into `src/` — always use a separate output directory (e.g., `code-gen/`) to distinguish generated from hand-written code
- **DO NOT** edit generated files manually — changes will be overwritten on next generation. Modify the YAML schema or templates instead.

### Common Mistakes

- **Forgetting to regenerate** after YAML changes — run `nx g @lagless/codegen:ecs --configPath <path>` after editing schema
- **Invalid component references in filters** — filter `include`/`exclude` must reference components defined in `components:` section
- **Zero or negative array lengths** — `uint8[0]` and `uint8[-1]` are invalid (parser throws error)
- **Missing projectName** — Either set `projectName:` in YAML or ensure config path contains project directory for auto-detection
- **Template syntax errors** — EJS templates use `<%= %>` for output and `<% %>` for logic; JavaScript syntax must be valid

## 8. Usage Examples

### CLI Usage

```bash
# Generate code from YAML schema
npx lagless-codegen -c path/to/ecs.yaml

# With custom output directory
npx lagless-codegen -c path/to/ecs.yaml -o src/generated

# With custom templates
npx lagless-codegen -c path/to/ecs.yaml -t my-templates/
```

### Nx Generator Usage

```bash
# In Nx monorepo
nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml
```

### Example YAML Schema

```yaml
# src/lib/schema/ecs.yaml
projectName: MyGame
components:
  Transform2d:
    positionX: float32
    positionY: float32
    rotation: float32
  Health:
    current: float32
    max: float32
singletons:
  GameState:
    startedAtTick: uint32
    finishedAtTick: uint32
playerResources:
  PlayerResource:
    id: uint8[16]
    score: uint32
inputs:
  Move:
    direction: float32
    speed: float32
  Shoot:
    angle: float32
filters:
  AliveFilter:
    include:
      - Transform2d
      - Health
```

### Programmatic Usage

```typescript
import { parseYamlConfig, generateCode } from '@lagless/codegen';
import * as fs from 'fs';
import * as path from 'path';

const yamlContent = fs.readFileSync('ecs.yaml', 'utf-8');
const { schema, projectName } = parseYamlConfig(yamlContent, 'ecs.yaml');

await generateCode({
  schema,
  projectName,
  outputDir: './generated',
  templateDir: './node_modules/@lagless/codegen/files',
  fileOperations: {
    readFile: (p) => fs.readFileSync(p, 'utf-8'),
    writeFile: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf-8');
    },
    joinPath: (...segments) => path.join(...segments),
    exists: (p) => fs.existsSync(p),
    readDir: (p) => fs.readdirSync(p),
    isDirectory: (p) => fs.statSync(p).isDirectory(),
  },
});

console.log('Generated ECS code!');
```

## 9. Testing Guidance

No test suite currently exists for this module. When adding tests, consider:

- **Parser tests:** Validate YAML parsing with valid/invalid schemas, component ID generation, field type parsing, project name extraction
- **Generator tests:** Verify generated code compiles and matches expected output (snapshot testing)
- **Template tests:** Check EJS templates render correctly with sample data
- **Integration tests:** Generate code from real schema, compile with TypeScript, instantiate classes
- **Error handling:** Test invalid YAML syntax, missing required fields, unsupported types, circular dependencies in filters
- Use `@lagless/core` test utilities to verify generated classes integrate correctly with ECS runtime

## 10. Change Checklist

When modifying this module:

1. **Changing component ID generation:** Update `parseYamlConfig()` logic AND document migration path for existing projects (component ID changes break save files)
2. **Adding new field types:** Update `parseFieldType()` AND ensure type is supported in `@lagless/binary` `typeToArrayConstructor`
3. **Modifying templates:** Test generated code compiles with TypeScript AND passes `@lagless/core` runtime checks
4. **Changing template directory structure:** Update `generateCode()` function to match new layout
5. **Adding new YAML sections:** Update `ECSConfig` interface, parser logic, generator function, AND add corresponding template directory
6. **Modifying CLI flags:** Update `commander` options in `cli.ts` AND update documentation
7. **Changing output file names:** Update `generateBarrelFileContent()` to match new naming scheme
8. **Breaking changes:** Bump version and document migration guide for users

## 11. Integration Notes

### With Nx Workspace

1. Add `@lagless/codegen` to workspace dependencies
2. Create `generators.json` in project root:
   ```json
   {
     "generators": {
       "ecs": {
         "factory": "./src/nx-generator",
         "schema": "./schema.json",
         "description": "Generate ECS code from YAML"
       }
     }
   }
   ```
3. Run generator: `nx g @lagless/codegen:ecs --configPath <path>`

### With ECS Projects

1. Create YAML schema file (e.g., `src/lib/schema/ecs.yaml`)
2. Run codegen to generate classes in `src/lib/schema/code-gen/`
3. Import generated classes:
   ```typescript
   import { Transform2d, Health, AliveFilter, MyGameRunner } from './schema/code-gen';
   ```
4. Extend runner class:
   ```typescript
   export class GameRunner extends MyGameRunner {
     constructor() {
       super({ /* ECSConfig */ });
     }
   }
   ```
5. Regenerate after schema changes: `nx g @lagless/codegen:ecs --configPath ...`

### Generated File Structure

```
code-gen/
├── index.ts                     # Barrel export (re-exports all classes)
├── Transform2d.ts               # Component class
├── Health.ts                    # Component class
├── GameState.ts                 # Singleton class
├── PlayerResource.ts            # PlayerResource class
├── Move.ts                      # Input class
├── Shoot.ts                     # Input class
├── AliveFilter.ts               # Filter class
├── MyGameInputRegistry.ts       # Input registry (maps input IDs to classes)
├── MyGame.core.ts               # Core module (getECSSchema() function)
└── MyGame.runner.ts             # Runner class (extends ECSRunner)
```

## 12. Appendix

### YAML Schema Format Reference

```yaml
# Optional: Project name (PascalCase). If omitted, derived from config path.
projectName: MyGame

# Components: Define entity data structures with typed fields
components:
  ComponentName:
    fieldName: fieldType
    # Supported types: uint8, uint16, uint32, int8, int16, int32, float32, float64
    # Arrays: type[length] (e.g., uint8[16] for 16-byte array)

# Singletons: Global state (one instance per simulation)
singletons:
  SingletonName:
    fieldName: fieldType

# Player Resources: Per-player state (one instance per player)
playerResources:
  ResourceName:
    fieldName: fieldType

# Inputs: Player commands (serialized over network)
inputs:
  InputName:
    fieldName: fieldType

# Filters: Entity iterators based on component membership
filters:
  FilterName:
    include:
      - ComponentName1
      - ComponentName2
    exclude:
      - ComponentName3
```

### Component ID Assignment

Components receive IDs as powers of 2 based on their order in the YAML file:

| Index | Component | ID (decimal) | ID (binary) |
|-------|-----------|--------------|-------------|
| 0     | First     | 1            | 0b00001     |
| 1     | Second    | 2            | 0b00010     |
| 2     | Third     | 4            | 0b00100     |
| 3     | Fourth    | 8            | 0b01000     |
| 4     | Fifth     | 16           | 0b10000     |

**Why powers of 2:** Entity bitmasks store component membership as a single integer. Filter matching uses bitwise AND operations:
```typescript
entity.bitmask & filter.includeMask === filter.includeMask  // Has all required components
entity.bitmask & filter.excludeMask === 0                   // Has no excluded components
```

### Supported Field Types

| Type      | Bytes | Range/Precision                     |
|-----------|-------|-------------------------------------|
| `uint8`   | 1     | 0 to 255                            |
| `uint16`  | 2     | 0 to 65,535                         |
| `uint32`  | 4     | 0 to 4,294,967,295                  |
| `int8`    | 1     | -128 to 127                         |
| `int16`   | 2     | -32,768 to 32,767                   |
| `int32`   | 4     | -2,147,483,648 to 2,147,483,647     |
| `float32` | 4     | IEEE 754 single precision           |
| `float64` | 8     | IEEE 754 double precision           |

**Array syntax:** Append `[length]` for fixed-size arrays (e.g., `uint8[16]` = 16-byte array).

### Template Directory Structure

```
files/
├── component/
│   └── __name__.ts.template      # Component class template
├── singleton/
│   └── __name__.ts.template      # Singleton class template
├── playerResource/
│   └── __name__.ts.template      # PlayerResource class template
├── filter/
│   └── __name__.ts.template      # Filter class template
├── input/
│   └── __name__.ts.template      # Input class template
├── input-registry/
│   └── __projectName__InputRegistry.ts.template
├── core/
│   └── __projectName__.core.ts.template
└── runner/
    └── __projectName__.runner.ts.template
```

Templates use EJS syntax:
- `<%= variable %>` — Output value
- `<% if (condition) { %>...<% } %>` — Control flow
- `__name__`, `__projectName__` — Filename placeholders replaced during generation

### CLI Options

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--config <path>` | `-c` | Yes | Path to YAML configuration file |
| `--output <path>` | `-o` | No | Output directory (default: `<config_dir>/../code-gen`) |
| `--templates <path>` | `-t` | No | Templates directory (default: built-in templates) |

### Example Generated Component Class

Input YAML:
```yaml
components:
  Health:
    current: float32
    max: float32
```

Generated TypeScript (simplified):
```typescript
import { ComponentBase } from '@lagless/core';

export class Health extends ComponentBase {
  static readonly id = 4; // Power of 2 based on index
  static readonly fields = {
    current: { type: 'float32', isArray: false },
    max: { type: 'float32', isArray: false },
  };

  unsafe = {
    current: new Float32Array(this.mem.arrayBuffer, this.byteOffset, this.maxEntities),
    max: new Float32Array(this.mem.arrayBuffer, this.byteOffset + 4 * this.maxEntities, this.maxEntities),
  };

  // ...additional methods
}
```

All field accessors use SoA (Struct of Arrays) layout backed by the simulation's single ArrayBuffer for deterministic snapshots and rollback.
