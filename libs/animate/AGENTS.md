# AGENTS: @lagless/animate

## Purpose and boundaries
- Provide lightweight, RAF-driven animation helpers for UI layers only.
- Not responsible for ECS state, networking, or deterministic simulation logic.

## Imports and entry points
- `libs/animate/src/index.ts` (public exports)
- `libs/animate/src/lib/animate.ts` (implementation)

## Common tasks -> files
- Add a timing function or helper: `libs/animate/src/lib/animate.ts`
- Update exports or public types: `libs/animate/src/index.ts`
- Update docs/examples: `libs/animate/README.md`

## Integration points
- Circle Sumo frontend uses `animatePromise` to animate the local player outline (`circle-sumo/circle-sumo-game/src/app/game-view/transform2d-view.tsx`).

## Invariants and rules
- Progress passed to `draw` is in the 0..1 range.
- Animation helpers must remain side-effect free beyond the supplied callbacks.
- Do not introduce ECS or network mutations here.

## Workflow for modifications
- Update types and exports, then update README example if the API changes.
- If behavior changes, check callers in Circle Sumo and update usage.
- Verify with `nx lint @lagless/animate` and `nx typecheck @lagless/animate` (and `nx build @lagless/animate` if needed).

## Example future AI tasks
1) Add a new easing curve: edit `libs/animate/src/lib/animate.ts`, export it, update README.
2) Add AbortSignal support: extend `animate` signature, handle cancel, update README and callers.
3) Add a cancelable promise helper: implement in `animate.ts`, export, document in README.
