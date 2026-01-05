# AGENTS: @lagless/circle-sumo-game

## Purpose and boundaries
- Provide the Circle Sumo frontend client (React + Pixi).
- Not responsible for backend matchmaking or server-side simulation.

## Imports and entry points
- `circle-sumo/circle-sumo-game/src/main.tsx`
- `circle-sumo/circle-sumo-game/src/app/app.tsx`
- `circle-sumo/circle-sumo-game/src/app/hooks/use-start-match.ts`
- `circle-sumo/circle-sumo-game/src/app/game-view/runner-provider.tsx`
- `circle-sumo/circle-sumo-game/src/app/game-view/assets-loader.tsx`

## Common tasks -> files
- Update matchmaking flow: `src/app/hooks/use-start-match.ts`.
- Update ECS runner wiring: `src/app/game-view/runner-provider.tsx`.
- Add gameplay UI or Pixi components: `src/app/game-view/**`.
- Update auth flows: `src/app/app.tsx` and `libs/react`.
- Update routing/screens: `src/app/router.tsx` and `src/app/screens/**`.

## Integration points
- Uses `@lagless/relay-input-provider` and `@lagless/circle-sumo-simulation`.
- Uses `@lagless/react` for auth and API access.
- Uses `@lagless/pixi-react` and `@lagless/animate` for visuals.

## Invariants and rules
- Do not mutate ECS memory directly; always go through runner and input providers.
- `CircleSumoInputRegistry` must match backend and simulation codegen.
- Ensure `MathOps.init()` and asset loading complete before gameplay.

## Workflow for modifications
- Update UI or input logic, then test against the backend.
- If simulation schema changes, regenerate code and update imports.
- Verify with `nx lint @lagless/circle-sumo-game` and `nx typecheck @lagless/circle-sumo-game`.
- Run locally with `nx dev @lagless/circle-sumo-game`.

## Example future AI tasks
1) Add a new HUD element: implement in `src/app/game-view/components`, update layout styles.
2) Add a new input action: update simulation schema, regenerate, update input handling in UI.
3) Update matchmaking UI flow: adjust `use-start-match.ts` and related screens.
