# AGENTS: @lagless/schemas

## Purpose and boundaries
- Provide shared TypeORM entity definitions for Lagless backend modules.
- Not responsible for service logic or API controllers.

## Imports and entry points
- `libs/api/schemas/src/index.ts`
- `libs/api/schemas/src/lib/*.schema.ts`

## Common tasks -> files
- Add a new entity: create `libs/api/schemas/src/lib/<name>.schema.ts`, export it in `src/index.ts`.
- Add or change columns: edit the relevant `*.schema.ts` file.
- Update consuming modules: `circle-sumo/circle-sumo-backend/src/app/app.module.ts` (TypeOrmModule entities).

## Integration points
- `@lagless/player` and `@lagless/game` services depend on these schemas.
- Circle Sumo backend registers these entities in its TypeORM configuration.

## Invariants and rules
- Entity names and column types must remain compatible with existing data.
- Do not introduce frontend dependencies; keep this backend-only.
- Always export new schemas from the package entry point.

## Workflow for modifications
- Update entity files and exports.
- Update backend modules and migrations/synchronization policy.
- Verify with `nx lint @lagless/schemas` and `nx typecheck @lagless/schemas`.

## Example future AI tasks
1) Add a new entity for rewards: create schema file, export it, register in backend.
2) Add a column to `PlayerSchema`: update schema, update services, migrate data.
3) Rename a column: update schema and backend queries, migrate data, update docs.
