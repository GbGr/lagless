# `@lagless/testbed`

## What it is
`@lagless/testbed` is a generated ECS schema package used for local experimentation and examples. It re-exports codegen output from a YAML schema.

## Why it exists / when to use it
Use it as a sandbox for trying out ECS schemas or tools without touching a production simulation. It is not consumed by Circle Sumo.

## Public API
- Generated exports from `libs/testbed/src/lib/schema/code-gen/index.ts` (components, inputs, filters, runner, and input registry).

## Typical usage
Circle Sumo does not use this package. A minimal usage looks like:

```ts
import { TestbedRunner, TestbedInputRegistry } from '@lagless/testbed';
import { ECSConfig, LocalInputProvider } from '@lagless/core';

const ecsConfig = new ECSConfig();
const inputProvider = new LocalInputProvider(ecsConfig, TestbedInputRegistry);
const runner = new TestbedRunner(ecsConfig, inputProvider, [], []);
```

## Key concepts & data flow
- `ecs.yaml` defines components, inputs, and filters.
- `@lagless/codegen` generates TypeScript classes into `schema/code-gen`.
- The package re-exports the generated barrel file.

## Configuration and environment assumptions
- Generated files are produced by `@lagless/codegen` from `libs/testbed/src/lib/schema/ecs.yaml`.
- Do not edit generated files directly.

## Pitfalls / common mistakes
- Editing files under `schema/code-gen` instead of the YAML schema.
- Forgetting to regenerate after updating the schema.

## Related modules
- `tools/codegen` for schema generation.
- `libs/core` for ECS runtime integration.
- `circle-sumo/circle-sumo-simulation` for a real simulation that uses codegen.
