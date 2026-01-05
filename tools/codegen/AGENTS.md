# AGENTS: @lagless/codegen

## Purpose and boundaries
- Generate ECS TypeScript code from YAML schemas.
- Do not implement runtime behavior here; runtime changes belong in schemas or templates.

## Imports and entry points
- `tools/codegen/src/index.ts` (exports parser and generator)
- `tools/codegen/src/parser.ts` (YAML parsing and validation)
- `tools/codegen/src/generator.ts` (code generation pipeline)
- `tools/codegen/src/template-engine.ts` (template rendering)
- `tools/codegen/src/nx-generator.ts` (Nx generator)
- `tools/codegen/src/cli.ts` (CLI)
- `tools/codegen/files/*` (EJS templates)

## Common tasks -> files
- Change YAML parsing rules: `tools/codegen/src/parser.ts`.
- Change generated output structure: `tools/codegen/src/generator.ts`.
- Update templates: `tools/codegen/files/*`.
- Update Nx generator options: `tools/codegen/src/nx-generator.ts`.

## Integration points
- Depends on `@lagless/core` ECS schema types and `@lagless/binary` field sizes.
- Generates code consumed by:
  - `circle-sumo/circle-sumo-simulation/src/lib/schema/code-gen`
  - `libs/testbed/src/lib/schema/code-gen`

## Invariants and rules
- If you need to change runtime behavior, do NOT edit generated files; edit schemas or templates.
- Output directory is `../code-gen` relative to the YAML schema file.
- Field types must be supported by `@lagless/binary` (`int8`, `uint8`, `int16`, `uint16`, `int32`, `uint32`, `float32`, `float64`).

## Workflow for modifications
- Update the YAML schema or templates.
- Regenerate code with Nx generator:
  - `nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml`
  - `nx g @lagless/codegen:ecs --configPath libs/testbed/src/lib/schema/ecs.yaml`
- Review generated files in `schema/code-gen` and update any simulation code or tests.
- Verify downstream modules compile: `nx typecheck @lagless/circle-sumo-simulation` and `nx typecheck @lagless/testbed`.

## Common failure modes
- Unsupported field type or missing array length in schema.
- Filter references a component not declared in `components`.
- Wrong `configPath` (generator cannot locate YAML).

## Example future AI tasks
1) Add a new template output file: update `files/*`, update `generator.ts` to emit it, update docs.
2) Support a new field type: update `@lagless/binary` and `parser.ts`, then update templates.
3) Change output directory naming: update `generator.ts` and `nx-generator.ts`, update README references.
