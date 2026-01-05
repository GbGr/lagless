# AGENTS: @lagless/testbed

## Purpose and boundaries
- Provide a generated ECS schema package for experiments and examples.
- Not responsible for game-specific systems or production simulations.

## Imports and entry points
- `libs/testbed/src/index.ts` (re-exports generated code)
- `libs/testbed/src/lib/schema/ecs.yaml` (source schema)
- `libs/testbed/src/lib/schema/code-gen/*` (generated output)

## Common tasks -> files
- Add or change components/inputs/filters: edit `libs/testbed/src/lib/schema/ecs.yaml`.
- Regenerate output: run `nx g @lagless/codegen:ecs --configPath libs/testbed/src/lib/schema/ecs.yaml`.
- Update exports if needed: `libs/testbed/src/index.ts`.

## Integration points
- Uses `@lagless/codegen` templates and `@lagless/core` ECS types.
- Can be used by local demos or tests to validate schema evolution.

## Invariants and rules
- Do not edit files in `libs/testbed/src/lib/schema/code-gen` manually.
- Keep schema names stable unless you are prepared to update all references.
- Regenerate whenever the YAML schema changes.

## Workflow for modifications
- Update the YAML schema.
- Regenerate code with the Nx generator.
- Review the generated barrel file and update any consumers.
- Verify with `nx lint @lagless/testbed`, `nx typecheck @lagless/testbed`, and `nx test @lagless/testbed`.

## Example future AI tasks
1) Add a new component: update `ecs.yaml`, regenerate, adjust any usage in demos.
2) Add a new input: update `ecs.yaml` inputs section, regenerate, wire into input providers.
3) Rename a component: update `ecs.yaml`, regenerate, update all imports and usage sites.
