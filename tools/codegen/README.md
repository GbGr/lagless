# `@lagless/codegen`

## What it is
`@lagless/codegen` generates ECS boilerplate from YAML schemas. It turns component/input definitions into TypeScript classes, registries, and runners so simulations stay consistent and deterministic.

## Why it exists / when to use it
Use it whenever you add or change ECS components, inputs, or filters. Codegen keeps the memory layout and input schemas aligned across client and server.

## Public API
- `parseYamlConfig`, `parseFieldType`, `parseInputFieldType`
- `generateCode`, `generateBarrelFileContent`
- Nx generator: `@lagless/codegen:ecs`

## Typical usage
Circle Sumo regenerates its schema with the Nx generator:

```bash
nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml
```

Testbed uses the same generator:

```bash
nx g @lagless/codegen:ecs --configPath libs/testbed/src/lib/schema/ecs.yaml
```

## Key concepts & data flow
- **Schema format**: YAML with `components`, `singletons`, `playerResources`, `inputs`, and `filters` keys.
- **Field types**: `int8`, `uint8`, `int16`, `uint16`, `int32`, `uint32`, `float32`, `float64`, plus fixed arrays like `uint8[16]`.
- **Pipeline**: YAML -> `parseYamlConfig` -> template engine -> generated TS files.
- **Output location**: `../code-gen` relative to the schema file (for Circle Sumo: `circle-sumo/circle-sumo-simulation/src/lib/schema/code-gen`).

## Configuration and environment assumptions
- `projectName` can be set in YAML; if omitted it is derived from the schema path.
- Templates live in `tools/codegen/files`.
- Generated files include components, singletons, player resources, filters, inputs, input registry, core, runner, and a barrel `index.ts`.
- Generated files should not be edited by hand.

## How to add or extend a schema
1) Edit or create a YAML schema file (see `circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml`).
2) Run the Nx generator with `--configPath` pointing to the YAML file.
3) Import the generated exports in your simulation and update any systems or input providers.

## Pitfalls / common mistakes
- Editing files in `code-gen` directly instead of the YAML schema.
- Referencing a component in a filter that does not exist in `components`.
- Using unsupported field types or array syntax.

## Related modules
- `libs/core` for ECS types consumed by the generator.
- `libs/binary` for field type sizes and memory tracking.
- `circle-sumo/circle-sumo-simulation` and `libs/testbed` for real usage.
