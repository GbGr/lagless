# @lagless/circle-sumo-game

## 1. Responsibility & Context

React + Pixi.js frontend application for Circle Sumo multiplayer game. Renders the deterministic ECS simulation from `@lagless/circle-sumo-simulation`, provides UI screens (title, game, locker, roulette), handles player authentication, manages virtual joystick input, displays VFX and game events, and connects to the relay server for networked gameplay. Built with React Router for navigation, Pixi.js for hardware-accelerated 2D rendering, and integrates the Lagless ECS framework for client-side prediction with rollback netcode.

## 2. Architecture Role

**Upstream dependencies:** `@lagless/circle-sumo-simulation`, `@lagless/core`, `@lagless/math`, `@lagless/binary`, `@lagless/misc`, `@lagless/react`, `@lagless/pixi-react`, `@lagless/animate`, `pixi.js`, `@pixi/react`, `neutrinoparticles.pixi`
**Downstream consumers:** None (end-user application)

This is the final application layer that brings together all Lagless libraries and the Circle Sumo simulation. It instantiates the ECS runner, subscribes to signals, renders entity state via Pixi.js, handles user input through virtual joystick, and displays React-based UI overlays. The app runs entirely in the browser with no server-side rendering.

## 3. Public API

This is an application, not a library, so there is no exported public API. However, the app is structured around these key modules:

### Screens (React Router Routes)

- **`/` (TitleScreen)** — Main menu: start game, navigate to locker/roulette
- **`/game` (GameScreen)** — Active gameplay with Pixi.js game view and HUD
- **`/locker` (LockerScreen)** — Player skin collection and inventory management
- **`/roulette` (RouletteScreen)** — Gacha spin for new skins with virtual carousel

### Providers (React Context)

- **`RunnerProvider`** — Wraps game view with `CircleSumoRunner` instance, manages runner lifecycle, subscribes to signals (`GameOverSignal`, `PlayerFinishedGameSignal`)
- **`RunnerTicker`** — Updates ECS runner every Pixi.js frame via `useTick()`
- **`ViewportProvider`** — Provides Pixi viewport (camera/zoom) for game world rendering
- **`FtueProvider`** — First-time user experience state management
- **`ReactQueryProvider`** — TanStack React Query wrapper (from `@lagless/react`)
- **`InstanceAuthContext`** — Conditional rendering based on auth state (from `@lagless/react`)

### Game View Components

- **`GameView`** — Main Pixi.js Application wrapper with viewport, arena, player rendering
- **`CircleSumoView`** — Iterates over all entities and renders player sprites with transforms
- **`Arena`** — Renders circular arena boundary with danger zone visual
- **`PlayerWorld`** — Container for all player entity sprites
- **`Transform2dView`** — Renders individual player sprite with interpolation between ticks
- **`HUD`** — React overlay with player stats, leaderboard, match timer
- **`GameOver`** — React modal with final leaderboard and MMR changes
- **`StartGameCountdown`** — 3-2-1 countdown before match starts
- **`ImpactVFX`** — Particle effects for high-impact collisions (subscribes to `HighImpactSignal`)
- **`DirectionArrowView`** — Arrow overlay showing player movement direction

### Custom Pixi Filters

- **`FabricPatternFilter` (flow-stripe-noise.filter.ts)** — Procedural fabric/damask pattern shader with two-color gradient (for Dynamic skins)
- **`ScreenSpaceNoiseFilter` (screen-space-noise.filter.ts)** — Film grain / noise overlay shader

### Character Preview Components

- **`CharacterPreview`** — Pixi.js sprite preview for skin selection UI (used in locker/roulette)
- **`CharacterPreviewBody`** — Body sprite with skin pattern applied
- **`CharacterPreviewEyes`** — Eye sprite overlay
- **`CharacterPreviewJams`** — Accessory sprite overlay

### Hooks & Utilities

- **`useRunner()`** — Access `CircleSumoRunner` from context
- **`useStartMatch()`** — Initiates match by creating input provider and navigating to `/game`
- **`useFtue()`** — First-time user experience state access
- **`useVirtualCarousel()`** — Virtual scrolling for roulette skin carousel
- **`coords-utils.ts`** — World-to-screen coordinate conversion helpers
- **`AssetsLoader`** — Preloads Pixi.js assets (textures, fonts) before app render

### Entry Point

- **`main.tsx`** — Vite application entry, renders `<App />` into DOM, initializes eruda devtools (dev mode only)
- **`App`** — Root React component: wires providers (ReactQuery, Auth, FTUE, Assets), renders RouterProvider

## 4. Preconditions

- **Modern browser with WebGL support** — Pixi.js requires GPU acceleration
- **Backend API available** at `VITE_API_URL` — For player authentication and profile data (see `@lagless/react`)
- **Relay server running** (if networked gameplay) — Circle Sumo uses client-side simulation; server only broadcasts inputs
- **Deterministic math initialized** — `MathOps.init()` called during app bootstrap (handled in assets loader)
- **Assets preloaded** — Pixi.js textures, particle effects, fonts loaded before game view renders
- **Touch or mouse input available** — Virtual joystick requires pointer events

## 5. Postconditions

- **Players can join matches, play, and see results** — Full gameplay loop from title screen to game over
- **Skin collection persists** — Player inventory saved to backend via `@lagless/react` auth system
- **Deterministic gameplay** — Same inputs → same simulation on all clients (rollback netcode)
- **Smooth 60 FPS rendering** — Pixi.js hardware-accelerated sprites, interpolated transforms
- **VFX and sound events triggered** — High-impact collisions spawn particle effects
- **Responsive UI overlays** — HUD, game over modal, countdown rendered with React

## 6. Invariants & Constraints

- **Browser-only** — No SSR; uses `window`, `localStorage`, WebGL APIs
- **Single Pixi.js Application instance** — Shared across all game views, reused between matches
- **Runner lifecycle tied to `/game` route** — Runner created on navigation to `/game`, disposed on unmount
- **Input delay matches simulation config** — Virtual joystick input sent with same delay as configured in `ECSConfig`
- **Asset paths hardcoded** — Textures and fonts loaded from `/assets/` directory (Vite public folder)
- **Viewport world size fixed** — Camera centered on arena (`CircleSumoArena.radius × 2`)
- **Character preview uses same filters as game** — Skin rendering identical in locker/roulette and gameplay
- **Signal subscriptions cleaned up on unmount** — `RunnerProvider` disposes runner and unsubscribes signals
- **Pixi.js 8.12.0 pinned** — Exact version required for compatibility with `@pixi/react` and filters

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT** modify viewport world size without updating arena rendering — causes visual/simulation mismatch
- **DO NOT** use server-side rendering or Node.js APIs — this is a browser-only app (uses `window`, `localStorage`, WebGL)
- **DO NOT** create multiple Pixi.js Application instances — causes GPU resource exhaustion and rendering glitches
- **DO NOT** forget to dispose runner on unmount — memory leaks and simulation continues in background
- **DO NOT** mutate ECS state outside systems — use input commands (`Move`, `LookAt`) via `runner.addInput()` instead
- **DO NOT** assume synchronous signal delivery — signals are emitted during `runner.tick()`, subscribe before first tick
- **DO NOT** hardcode skin IDs in UI — use `PLAYER_PRESETS` and `SKINS_COUNT` from `@lagless/circle-sumo-simulation` instead
- **DO NOT** modify custom filter shaders without testing on multiple GPUs — GLSL compatibility varies across devices

### Common Mistakes

- **Not preloading assets** — Pixi.js throws errors if textures not loaded before rendering. Use `AssetsLoader` wrapper.
- **Forgetting to dispose runner** — Runner keeps ticking in background after navigating away from `/game`. Always dispose in useEffect cleanup.
- **Mixing UI state with ECS state** — React state (e.g., HUD visibility) should NOT live in ECS. Keep UI and simulation separate.
- **Not handling signal timing** — Signals emitted during `runner.tick()`. If subscribing after tick, you miss events. Subscribe immediately after runner creation.
- **Using non-deterministic random for VFX** — VFX positioning can use `Math.random()` (visual only), but gameplay logic must use `mem.prng`.
- **Assuming player slot = array index** — Player slots can have gaps (disconnected players). Always check `PlayerResource.connected` field.

## 8. Usage Examples

### Starting the App (Development)

```bash
# From monorepo root
nx serve circle-sumo-game

# Or with environment variable
VITE_API_URL=https://api.example.com nx serve circle-sumo-game
```

### Basic App Flow

```
1. User opens app → App.tsx renders
2. ReactQueryProvider + InstanceAuthContext → authenticate user
3. AssetsLoader preloads Pixi.js assets (textures, fonts, WASM math)
4. RouterProvider renders TitleScreen (/)
5. User clicks "Play" → navigate to /game
6. GameScreen renders GameView → RunnerProvider creates CircleSumoRunner
7. RunnerTicker calls runner.update() every frame
8. CircleSumoView renders all entities from simulation
9. User interacts with virtual joystick → Move/LookAt inputs added to runner
10. GameOverSignal fires → GameOver modal displays leaderboard
11. User clicks "Back" → navigate to / → runner disposed
```

### Adding a New Screen

```typescript
// 1. Create screen component
// src/app/screens/my-screen.tsx
export const MyScreen: FC = () => {
  return <div>My Screen</div>;
};

// 2. Add route to router.tsx
import { MyScreen } from './screens/my-screen';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      // ...existing routes
      {
        path: 'my-screen',
        Component: MyScreen,
      },
    ],
  },
]);

// 3. Navigate from other screens
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();
navigate('/my-screen');
```

### Subscribing to Game Events

```typescript
// Inside RunnerProvider or component
const runner = useRunner();
const gameOverSignal = runner.DIContainer.resolve(GameOverSignal);

useEffect(() => {
  const unsubscribe = gameOverSignal.Verified.subscribe((data) => {
    console.log('Game over!', data);
    // Show leaderboard, navigate away, etc.
  });

  return unsubscribe; // Clean up on unmount
}, [gameOverSignal]);
```

### Rendering Custom Entities

```typescript
import { Container, useTick } from '@pixi/react';
import { useRunner } from '../runner-provider';
import { Transform2d } from '@lagless/circle-sumo-simulation';

export const CustomEntityView: FC = () => {
  const runner = useRunner();
  const [entities, setEntities] = useState<number[]>([]);

  useTick(() => {
    const filter = runner.core.mem.filters.get(Transform2dFilter);
    setEntities([...filter.entities]);
  });

  return (
    <Container>
      {entities.map((entityId) => {
        const transform = runner.core.mem.components.get(Transform2d);
        const x = transform.unsafe.positionX[entityId];
        const y = transform.unsafe.positionY[entityId];

        return <sprite key={entityId} x={x} y={y} texture="myTexture" />;
      })}
    </Container>
  );
};
```

### Using Custom Filters

```typescript
import { FabricPatternFilter } from '../filters/flow-stripe-noise.filter';
import { useApp } from '@pixi/react';

export const FilteredSprite: FC = () => {
  const app = useApp();
  const filter = useMemo(() => new FabricPatternFilter({
    colorA: 0xFF0000,
    colorB: 0x0000FF,
    scale: 3,
  }), []);

  return <sprite texture="player" filters={[filter]} />;
};
```

### Character Preview for Skin Selection

```typescript
import { CharacterPreview } from '../components/character-preview/character-preview';

export const SkinSelector: FC = () => {
  const [selectedSkinId, setSelectedSkinId] = useState(0);

  return (
    <div>
      <CharacterPreview skinId={selectedSkinId} />
      <button onClick={() => setSelectedSkinId((id) => id + 1)}>
        Next Skin
      </button>
    </div>
  );
};
```

## 9. Testing Guidance

No test suite currently exists for this module. When adding tests, consider:

- **Component tests:** Use `@testing-library/react` to test screen navigation, button clicks, modal rendering
- **Integration tests:** Use Playwright or Cypress to test full user flows (auth → title → game → game over)
- **Pixi.js rendering tests:** Use headless canvas or snapshot testing for Pixi.js scene graph
- **Signal subscription tests:** Mock `CircleSumoRunner` and verify UI updates on signal emissions
- **Input tests:** Simulate virtual joystick drag and verify `Move`/`LookAt` inputs added to runner
- **Asset loading tests:** Verify all textures, fonts, and VFX assets load without errors
- **Filter tests:** Render sprites with custom filters and verify shader compilation
- **Viewport tests:** Verify camera follows player, zoom works correctly
- **Responsive tests:** Test on various screen sizes (mobile, tablet, desktop)

## 10. Change Checklist

When modifying this module:

1. **Adding new screens:** Update `router.tsx`, add screen component, test navigation
2. **Modifying game view:** Test with real simulation to ensure rendering matches ECS state
3. **Changing Pixi.js version:** Verify compatibility with `@pixi/react`, `pixi-viewport`, custom filters
4. **Adding new filters:** Test shader on multiple GPUs (Intel, NVIDIA, AMD), verify WebGL compatibility
5. **Updating assets:** Regenerate sprite atlases, update asset paths in `AssetsLoader`
6. **Changing auth flow:** Update `@lagless/react` usage, test with backend API
7. **Modifying runner lifecycle:** Ensure runner disposed on unmount, no memory leaks
8. **Adding new signals:** Subscribe in `RunnerProvider`, update UI components to handle events
9. **Changing viewport bounds:** Update arena rendering to match new world size
10. **Refactoring providers:** Verify context dependencies, test unmount/remount scenarios

## 11. Integration Notes

### With Backend API (via @lagless/react)

1. Backend provides `/player/auth/instant` for account creation
2. Backend provides `/player/me` for profile data (MMR, owned skins)
3. Backend provides `/player/login` for token refresh
4. Frontend stores JWT in `localStorage` via `AuthTokenStore`
5. Frontend sends `Authorization: Bearer <token>` on all API requests

### With Circle Sumo Simulation

1. Frontend imports `CircleSumoRunner`, `CircleSumoSystems`, `CircleSumoSignals`
2. Frontend creates runner with `ECSConfig` (FPS, max entities, seed)
3. Frontend subscribes to `GameOverSignal`, `HighImpactSignal`, `PlayerFinishedGameSignal`
4. Frontend reads entity state every frame for rendering (Transform2d, Skin, Velocity2d)
5. Frontend sends player inputs via `runner.addInput(Move, slot)` and `runner.addInput(LookAt, slot)`

### With Networking (Future)

1. Relay server broadcasts inputs from all players
2. Client receives inputs via WebSocket and adds to runner
3. Client applies input delay (from `InputDelayController`)
4. Client performs rollback when late inputs arrive
5. Server never simulates — clients simulate independently and stay in sync

### With Pixi.js Ecosystem

- Uses `@pixi/react` for declarative Pixi.js rendering in React
- Uses `pixi-viewport` for camera/zoom controls
- Uses `pixi-filters` for built-in shader effects
- Uses `neutrinoparticles.pixi` for particle VFX
- Uses custom GLSL shaders for procedural skin patterns

### With Virtual Joystick (@lagless/pixi-react)

1. `VirtualJoystickProvider` wraps game view
2. `useVirtualJoystick()` hook accesses joystick state (direction, power, axisX, axisY)
3. Joystick state converted to `Move` input with direction/speed
4. Input sent via `runner.addInput(Move, playerSlot)`
5. Joystick uses `toFloat32()` for deterministic values (compatible with ECS)

## 12. Appendix

### Screen Structure

```
/ (TitleScreen)
  ├─ Play button → /game
  ├─ Locker button → /locker
  └─ Roulette button → /roulette

/game (GameScreen)
  └─ GameView (Pixi.js)
      ├─ Arena (circle boundary)
      ├─ Player sprites (Transform2d + Skin)
      ├─ Direction arrows
      ├─ Impact VFX (particles)
      └─ React overlays:
          ├─ HUD (stats, timer)
          ├─ GameOver (leaderboard)
          └─ StartGameCountdown (3-2-1)

/locker (LockerScreen)
  └─ Grid of owned skins with CharacterPreview

/roulette (RouletteScreen)
  └─ Virtual carousel with gacha spin mechanic
```

### Component Hierarchy (Game View)

```
<RunnerProvider>               # Creates CircleSumoRunner
  <HUD />                      # React overlay (stats)
  <GameOver />                 # React overlay (leaderboard)
  <Application>                # Pixi.js root
    <ViewportProvider>         # Camera/zoom
      <PlayerWorld>            # Entity container
        <Arena />              # Circle boundary
        <RunnerTicker>         # Calls runner.update()
          <CircleSumoView>     # Iterates entities
            <Transform2dView   # Individual player sprite
              skinId={...}
              entityId={...}
            />
          </CircleSumoView>
        </RunnerTicker>
      </PlayerWorld>
      <StartGameCountdown />   # 3-2-1 overlay
    </ViewportProvider>
  </Application>
</RunnerProvider>
```

### Asset Structure

```
public/
├── assets/
│   ├── textures/
│   │   ├── player-body.png
│   │   ├── player-eyes.png
│   │   ├── player-jams.png
│   │   ├── arena-bg.png
│   │   └── ...
│   ├── fonts/
│   │   └── game-font.fnt
│   └── particles/
│       └── impact.json
```

Assets loaded via `AssetsLoader.tsx` before app renders.

### Custom Filter Architecture

Both `FabricPatternFilter` and `ScreenSpaceNoiseFilter` extend Pixi.js `Filter` class:

1. **Vertex shader** — Standard Pixi.js vertex shader (transforms sprite coordinates)
2. **Fragment shader** — Custom GLSL code for pixel color computation
3. **Uniforms** — Parameters passed from TypeScript to shader (colors, scale, time)
4. **Apply to sprite** — `<sprite filters={[new FabricPatternFilter(options)]} />`

**FabricPatternFilter:**
- Procedural damask/fabric pattern
- Two-color gradient (colorA, colorB)
- Scale parameter controls pattern size
- Used for Dynamic player skins

**ScreenSpaceNoiseFilter:**
- Film grain / noise overlay
- Time-varying noise for animation
- Applied to entire viewport for retro effect

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | Yes | None | Backend API base URL (e.g., `https://api.lagless.com`) |

### Performance Considerations

- **60 FPS target** — Pixi.js renders at display refresh rate, ECS ticks at 60 Hz
- **Interpolation** — `Transform2dView` interpolates between previous and current position for smooth rendering
- **Batching** — Pixi.js batches sprites with same texture for efficient GPU draw calls
- **Particle pooling** — Neutrino particles reuse instances to reduce allocations
- **Virtual scrolling** — Roulette carousel only renders visible skins (performance with 1400+ skins)
- **Asset lazy loading** — Only load assets needed for current screen (title screen loads minimal assets)

### Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome/Edge | 90+ | ✅ Fully supported |
| Firefox | 88+ | ✅ Fully supported |
| Safari | 14+ | ✅ Supported (WebGL 2 required) |
| Mobile Safari (iOS) | 14+ | ✅ Supported |
| Chrome Android | 90+ | ✅ Supported |

**Requirements:**
- WebGL 2.0 support
- ES2020 JavaScript features
- `localStorage` API
- Pointer Events API (for virtual joystick)

### Development Tools

- **Vite** — Build tool and dev server
- **vite-plugin-wasm** — Load WASM modules (for `@lagless/deterministic-math`)
- **vite-plugin-svgr** — Import SVGs as React components
- **vite-plugin-top-level-await** — Enable top-level await in modules
- **eruda** — Mobile devtools console (dev mode only)

### Build Output

Production build generates:
- Optimized JavaScript bundles (code splitting by route)
- Compressed textures and assets
- Source maps (optional)
- `index.html` entry point

Deploy to static hosting (Vercel, Netlify, S3) — no server required.
