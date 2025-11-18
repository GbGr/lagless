# `@lagless/circle-sumo-frontend`

> React + Pixi client that renders Circle Sumo, runs local prediction on top of the ECS simulation, and integrates with relay networking.

## 1. Responsibility & Context

- **Primary responsibility**: Provide the player-facing UI, hook into `CircleSumoRunner` for prediction/rollback, and manage matchmaking/relay connectivity.
- **Upstream dependencies**: `@lagless/circle-sumo-simulation`, `@lagless/core`, `@lagless/math`, `@lagless/relay-input-provider`, `@lagless/react` (auth tokens), Pixi React.
- **Downstream consumers**: Browser clients (desktop/mobile) launched via Vite.
- **ECS lifecycle role**: `Render / Network / Simulate (prediction)`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | `useTick` from `@pixi/react` feeds `CircleSumoRunner.update(deltaMS)` |
| Authority | Client runs speculative ECS world; backend relay remains authoritative |
| Persistence strategy | None locally; relies on rollback/resimulation from authoritative input stream |
| Network boundary | Uses `Matchmaking` + `RelayInputProvider` (commented stub) to connect to Colyseus relay; currently defaults to `LocalInputProvider` for offline dev |

### 2.1 Simulation / Rollback / Resimulate

- `RunnerProvider` initializes `CircleSumoRunner` with either local or relay input provider, ensuring `MathOps.init()` runs before start.
- When connected to the relay, the input provider processes fan-out commands, requests rollbacks, and replays ticks so UI reflects authoritative state.
- Systems mirror backend order via `CircleSumoSystems`; maintain identical config (`ECSConfig({ fps: 60 })`).

### 2.2 Networking Interaction

- `Matchmaking` connects to Colyseus `matchmaking` room, receives seat reservation, then `RelayInputProvider` attaches to the `relay` room (currently commented out for local testing).
- Only input commands are sent; signals from server (PlayerFinishedGame/GameOver) eventually drive UI transitions.
- Auth tokens come from `AuthTokenStore`; README must instruct devs to supply tokens before connecting.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `RunnerProvider`, `useRunner`, `RunnerTicker` | components/hooks | Wrap the ECS runner and expose it to Pixi/React trees. | Stable |
| `GameView` components | React components | Render arena, players, and overlays from ECS state. | Stable |
| `InputDrainer` (WIP) | component | Bridges UI inputs into ECS RPCs. | Experimental |

## 4. Preconditions

- `AuthTokenStore` must hold a valid JWT before attempting matchmaking/relay connections.
- `MathOps.init()` is awaited inside `RunnerProvider`; do not bypass or start simulation prematurely.
- When enabling relay mode, environment variable `VITE_RELAY_URL` must point to backend.

## 5. Postconditions

- Runner updates each frame, mutating ECS state shown by Pixi layers; local prediction stays close to authoritative state when connected.
- On unmount, `RunnerProvider` disposes the runner/input provider to avoid orphaned sockets.

## 6. Invariants & Constraints

- UI should never mutate ECS memory directly; only send input RPCs or read state via DI-resolved resources.
- Player slots must remain consistent with relay assignments; hardcoding local playerSlot is acceptable only for offline demos.
- Keep Vite dev server isolated from production API to avoid leaking tokens.

## 7. Safety Notes & Implementation Notes for AI Agents

- When re-enabling `RelayInputProvider`, ensure cleanup handles `inputProvider.dispose()` on component unmount.
- Avoid referencing browser globals (window/document) inside systems—keep them within React layers.
- Document any additional inputs (keyboard/mouse) in README along with deterministic mapping to RPCs.
- Ensure `RunnerProvider` updates when config/integration logic changes; rerun `MathOps.init()` as needed.

## 8. Example Usage

```tsx
import { RunnerProvider, RunnerTicker } from './app/game-view/runner-provider';
import { CircleSumoGameView } from './app/game-view/game-view';

export function App() {
  return (
    <RunnerProvider>
      <RunnerTicker>
        <CircleSumoGameView />
      </RunnerTicker>
    </RunnerProvider>
  );
}
```

## 9. Testing Guidance

- `nx serve @lagless/circle-sumo-frontend` for manual verification.
- Add Vitest/React Testing Library tests for deterministic UI mapping (transform components reflect ECS state).
- End-to-end plan: connect to staging backend, ensure rollback corrections are rendered without artifacts.

## 10. Change Checklist

- [ ] Runner initialization sequence (MathOps + ECSConfig) documented for any adjustments.
- [ ] Networking flow (matchmaking/relay) described when toggled on.
- [ ] UI-to-input mappings documented; new inputs validated before dispatch.
- [ ] README updated if build/test commands or environment variables change.

## 11. Integration Notes (Optional)

- When connecting to backend, keep `Matchmaking` and `RelayInputProvider` usage in sync with `@lagless/net-wire` version.
- Use `Transform2DView` components to visualize ECS transforms; extend them as new components are added.

## 12. Appendix (Optional)

- For asset loading details, see `src/app/game-view/assets-loader.tsx`; it handles Pixi texture prefetch.
