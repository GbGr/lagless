# AGENTS.md - @lagless/codegen

AI coding guide for the code generation tool.

## Tool Purpose

Generates TypeScript classes from YAML schema:
- Component classes (SoA data storage)
- Singleton classes (global state)
- PlayerResource classes (per-player data)
- Filter classes (entity queries)
- Input classes (RPC definitions)
- InputRegistry, Core, Runner classes

## Running Codegen

```bash
# Via Nx (recommended)
nx g @lagless/codegen:ecs --configPath <path-to-schema.yaml>

# Via CLI
npx lagless-codegen -c <path-to-schema.yaml> -o <output-dir>
```

## Schema Syntax

### Complete Schema Structure

```yaml
projectName: MyGame  # PascalCase

components:
  ComponentName:
    fieldName: type    # int8|uint8|int16|uint16|int32|uint32|float32|float64
    arrayField: type[length]  # Fixed-size array

singletons:
  SingletonName:
    fieldName: type

playerResources:
  ResourceName:
    fieldName: type

inputs:
  InputName:
    fieldName: type

filters:
  FilterName:
    include:
      - ComponentName
    exclude:           # Optional
      - OtherComponent
```

### Type Reference

| Type | Bytes | Range | Use Case |
|------|-------|-------|----------|
| `int8` | 1 | -128..127 | Signed small values |
| `uint8` | 1 | 0..255 | Flags, small counts, enums |
| `int16` | 2 | -32768..32767 | Medium signed values |
| `uint16` | 2 | 0..65535 | Entity IDs, medium counts |
| `int32` | 4 | ±2B | Large signed values, MMR changes |
| `uint32` | 4 | 0..4B | Ticks, entity refs, timestamps |
| `float32` | 4 | IEEE 754 | Positions, rotations, speeds |
| `float64` | 8 | IEEE 754 | High-precision values |

### Array Syntax

```yaml
playerResources:
  PlayerData:
    id: uint8[16]      # 16 uint8 values (UUID)
    inventory: uint16[8]  # 8 uint16 values
```

## Generated File Structure

```
<output-dir>/
├── index.ts                      # Barrel exports
├── <ComponentName>.ts            # For each component
├── <SingletonName>.ts            # For each singleton
├── <ResourceName>.ts             # For each playerResource
├── <FilterName>.ts               # For each filter
├── <InputName>.ts                # For each input
├── <ProjectName>InputRegistry.ts # Input registry
├── <ProjectName>.core.ts         # ECSDeps aggregation
└── <ProjectName>.runner.ts       # ECSRunner subclass
```

## Generated Class Patterns

### Component

```typescript
class Transform2d {
  static readonly ID = 2;  // Bitmask for filtering
  static readonly schema = { positionX: Float32Array, ... };

  readonly unsafe = { positionX: Float32Array, ... };  // Direct access

  getCursor(entity: number): Cursor;  // Object-like access

  static calculateSize(maxEntities: number, memTracker: MemoryTracker): void;
}
```

### Singleton

```typescript
class GameState {
  readonly safe = { phase: number, startedAtTick: number, ... };
}
```

### PlayerResource

```typescript
class PlayerResource {
  readonly safe = { id: Uint8Array, entity: number, ... };
  readonly unsafe = { id: Uint8Array, ... };
}
```

### Filter

```typescript
class MovableFilter extends AbstractFilter {
  static readonly include = [Transform2d, Velocity2d];
  static readonly exclude = [];
  readonly includeMask = 6;   // Component.ID bitwise OR
  readonly excludeMask = 0;
}
```

### Input

```typescript
class Move {
  static readonly id = 1;
  readonly id = 1;
  readonly byteLength = 8;
  readonly fields = [
    { name: 'direction', type: FieldType.Float32, ... },
    { name: 'speed', type: FieldType.Float32, ... },
  ];
  readonly schema!: { direction: number; speed: number; };
}
```

## Parser Logic

### File: parser.ts

```typescript
// Parses YAML to ECSSchema
parseYamlConfig(configContent: string, configPath?: string): {
  schema: ECSSchema;
  projectName: string;
}

// Parses field type string
parseFieldType(typeStr: string): FieldDefinition
// "float32" -> { type: "float32", isArray: false }
// "uint8[16]" -> { type: "uint8", isArray: true, arrayLength: 16 }

// Derives project name from path
getProjectNameFromConfigPath(configPath: string): string
// "circle-sumo/..." -> "CircleSumo"
```

## Generator Logic

### File: generator.ts

```typescript
// Main entry point
generateCode(options: GenerateCodeOptions): Promise<void>

// Generates barrel file content
generateBarrelFileContent(schema: ECSSchema, projectName: string): string
```

### Template Processing

Templates use EJS syntax:

```ejs
export class <%= component.name %> {
  <% for (const [fieldName, field] of Object.entries(fields)) { %>
    <%= fieldName %>: <%= typeToArrayConstructor[field.type].name %>;
  <% } %>
}
```

## Adding New Schema Elements

### New Component

```yaml
components:
  NewComponent:
    fieldA: float32
    fieldB: uint8
```

Regenerate, then import:

```typescript
import { NewComponent } from '../schema/code-gen/index.js';
```

### New Input

```yaml
inputs:
  NewAction:
    param1: float32
    param2: uint32
```

Use in system:

```typescript
const rpcs = this._Input.getTickRPCs(tick, NewAction);
for (const rpc of rpcs) {
  const { param1, param2 } = rpc.data;
}
```

### New Filter

```yaml
filters:
  NewFilter:
    include:
      - ComponentA
      - ComponentB
    exclude:
      - ComponentC
```

Inject and iterate:

```typescript
constructor(private readonly _NewFilter: NewFilter) {}

update(tick: number) {
  for (const entity of this._NewFilter) {
    // entity has ComponentA and ComponentB, but not ComponentC
  }
}
```

## Template Files

```
tools/codegen/files/
├── component/__name__.ts.template
├── singleton/__name__.ts.template
├── playerResource/__name__.ts.template
├── filter/__name__.ts.template
├── input/__name__.ts.template
├── input-registry/__projectName__InputRegistry.ts.template
├── core/__projectName__.core.ts.template
└── runner/__projectName__.runner.ts.template
```

## Common Issues

### Component ID Collision

Component IDs are powers of 2 (bitmask). Order matters:

```yaml
components:
  First:   # ID = 1
  Second:  # ID = 2
  Third:   # ID = 4
  Fourth:  # ID = 8
```

### Filter Include Order

Filter `includeMask` is computed from component IDs:

```yaml
filters:
  MyFilter:
    include:
      - First   # ID 1
      - Third   # ID 4
    # includeMask = 1 | 4 = 5
```

### Array Field Access

```typescript
// For uint8[16] field 'id':
// unsafe access
for (let i = 0; i < 16; i++) {
  playerResource.unsafe.id[i] = bytes[i];
}

// safe access (returns typed array)
const idArray = playerResource.safe.id;
```

## DO's and DON'Ts

### DO

- Run codegen after every schema change
- Commit generated files
- Use smallest appropriate type
- Document schema with YAML comments
- Include `prev*` fields for interpolated values

### DON'T

- Edit generated files manually
- Use float64 when float32 suffices
- Create circular filter dependencies
- Forget to update systems after schema changes
- Use very long array fields (memory cost)

## File Structure

```
tools/codegen/
├── src/
│   ├── index.ts         # Public exports
│   ├── cli.ts           # CLI entry point
│   ├── nx-generator.ts  # Nx generator
│   ├── generator.ts     # Main generation logic
│   ├── parser.ts        # YAML parsing
│   ├── template-engine.ts # EJS template processing
│   └── dirname.ts       # ESM __dirname helper
├── files/               # EJS templates
├── generators.json      # Nx generator config
└── package.json
```
