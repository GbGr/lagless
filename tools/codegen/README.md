# @lagless/codegen

Code generator for the Lagless framework. Generates TypeScript classes from YAML schema definitions.

## Installation

The codegen tool is part of the monorepo and can be used via Nx:

```bash
nx g @lagless/codegen:ecs --configPath <path-to-schema.yaml>
```

Or via CLI:

```bash
npx lagless-codegen -c <path-to-schema.yaml> -o <output-dir>
```

## Overview

The codegen tool transforms YAML schema files into:

- **Component classes**: Entity data storage with typed arrays
- **Singleton classes**: Global game state
- **PlayerResource classes**: Per-player data
- **Filter classes**: Entity queries by component composition
- **Input classes**: Network input definitions
- **InputRegistry**: Registry of all input types
- **Core class**: ECS dependencies aggregation
- **Runner class**: Game runner extending ECSRunner

## Schema Format

### Basic Structure

```yaml
projectName: MyGame  # Used for generated class names

components:
  ComponentName:
    fieldName: fieldType

singletons:
  SingletonName:
    fieldName: fieldType

playerResources:
  ResourceName:
    fieldName: fieldType

inputs:
  InputName:
    fieldName: fieldType

filters:
  FilterName:
    include:
      - ComponentName
    exclude:
      - OtherComponent  # optional
```

### Supported Field Types

| Type | Bytes | TypedArray | Range |
|------|-------|------------|-------|
| `int8` | 1 | Int8Array | -128 to 127 |
| `uint8` | 1 | Uint8Array | 0 to 255 |
| `int16` | 2 | Int16Array | -32768 to 32767 |
| `uint16` | 2 | Uint16Array | 0 to 65535 |
| `int32` | 4 | Int32Array | -2^31 to 2^31-1 |
| `uint32` | 4 | Uint32Array | 0 to 2^32-1 |
| `float32` | 4 | Float32Array | IEEE 754 single |
| `float64` | 8 | Float64Array | IEEE 754 double |

### Array Types

Use `type[length]` for fixed-size arrays:

```yaml
playerResources:
  PlayerData:
    id: uint8[16]  # 16-byte array (e.g., for UUID)
```

## Example Schema

```yaml
# circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml
projectName: CircleSumo

components:
  Transform2d:
    positionX: float32
    positionY: float32
    rotation: float32
    prevPositionX: float32
    prevPositionY: float32
    prevRotation: float32

  Velocity2d:
    velocityX: float32
    velocityY: float32
    angularVelocity: float32

  CircleBody:
    playerSlot: uint8
    radius: float32
    mass: float32
    restitution: float32
    linearDamping: float32
    angularDamping: float32

  Health:
    current: uint16
    max: uint16

singletons:
  GameState:
    phase: uint8
    startedAtTick: uint32
    finishedAtTick: uint32

playerResources:
  PlayerResource:
    id: uint8[16]
    mmr: uint32
    entity: uint32
    connected: uint8

inputs:
  Move:
    direction: float32
    speed: float32

  Attack:
    targetEntity: uint32

filters:
  MovableFilter:
    include:
      - Transform2d
      - Velocity2d

  PhysicsFilter:
    include:
      - Transform2d
      - Velocity2d
      - CircleBody
```

## Generated Code

### Component Class

```typescript
// Generated: Transform2d.ts
export class Transform2d {
  public static readonly ID = 2;
  public static readonly schema = {
    positionX: Float32Array,
    positionY: Float32Array,
    rotation: Float32Array,
    // ...
  };

  // Direct typed array access
  public readonly unsafe = {} as {
    positionX: Float32Array;
    positionY: Float32Array;
    rotation: Float32Array;
    // ...
  };

  // Object-like accessor
  public getCursor(index: number): {
    readonly entity: number;
    positionX: number;
    positionY: number;
    rotation: number;
    // ...
  };
}
```

### Singleton Class

```typescript
// Generated: GameState.ts
export class GameState {
  public readonly safe = {} as {
    phase: number;
    startedAtTick: number;
    finishedAtTick: number;
  };
}
```

### Filter Class

```typescript
// Generated: MovableFilter.ts
export class MovableFilter extends AbstractFilter {
  public static readonly include = [Transform2d, Velocity2d];
  public static readonly exclude = [];
  public readonly includeMask = 6;  // Binary mask
  public readonly excludeMask = 0;
}
```

### Input Class

```typescript
// Generated: Move.ts
export class Move {
  public static readonly id = 1;
  public readonly id = 1;
  public readonly byteLength = 8;

  public readonly fields = [
    { name: 'direction', type: FieldType.Float32, isArray: false, byteLength: 4 },
    { name: 'speed', type: FieldType.Float32, isArray: false, byteLength: 4 },
  ] as const;

  public readonly schema!: {
    direction: number;
    speed: number;
  };
}
```

### Core Class

```typescript
// Generated: CircleSumo.core.ts
export const CircleSumoCore: ECSDeps = {
  components: [Skin, Transform2d, Velocity2d, CircleBody, ...],
  singletons: [GameState],
  filters: [MovableFilter, PhysicsFilter, ...],
  playerResources: [PlayerResource],
  inputRegistry: new CircleSumoInputRegistry(),
};
```

### Runner Class

```typescript
// Generated: CircleSumo.runner.ts
export class CircleSumoRunner extends ECSRunner {
  constructor(
    Config: ECSConfig,
    InputProviderInstance: AbstractInputProvider,
    Systems: Array<IECSSystemConstructor>,
    Signals: Array<ISignalConstructor> = [],
  ) {
    super(Config, InputProviderInstance, Systems, Signals, CircleSumoCore);
  }
}
```

## CLI Usage

```bash
# Basic usage
npx lagless-codegen -c src/schema/ecs.yaml

# With custom output directory
npx lagless-codegen -c src/schema/ecs.yaml -o src/generated

# With custom templates
npx lagless-codegen -c src/schema/ecs.yaml -t ./custom-templates
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config` | Path to YAML schema file | Required |
| `-o, --output` | Output directory | `<schema-dir>/../code-gen` |
| `-t, --templates` | Templates directory | Built-in templates |

## Nx Generator

```bash
nx g @lagless/codegen:ecs --configPath <path>
```

The Nx generator automatically:
1. Reads the YAML schema
2. Generates TypeScript files
3. Creates barrel exports (index.ts)

## Template Customization

Templates use EJS syntax. Default templates are in `tools/codegen/files/`:

```
files/
├── component/__name__.ts.template
├── singleton/__name__.ts.template
├── playerResource/__name__.ts.template
├── filter/__name__.ts.template
├── input/__name__.ts.template
├── input-registry/__projectName__InputRegistry.ts.template
├── core/__projectName__.core.ts.template
└── runner/__projectName__.runner.ts.template
```

## Best Practices

### Schema Organization

1. **Group related components** - Put physics fields together, rendering fields together
2. **Use appropriate types** - Use smallest type that fits your data
3. **Include prev values** - For interpolation, include `prevX`, `prevY` fields
4. **Meaningful filter names** - Name filters by their purpose (`PhysicsFilter`, `RenderableFilter`)

### Regeneration

Run codegen whenever schema changes:

```bash
# Watch mode not available - run manually after schema changes
nx g @lagless/codegen:ecs --configPath src/lib/schema/ecs.yaml
```

### Version Control

- **Commit generated files** - Ensures builds work without running codegen
- **Add schema comment** - First line can document the generation command

```yaml
# nx g @lagless/codegen:ecs --configPath path/to/this/file
projectName: MyGame
```
