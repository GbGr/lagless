# @lagless/react

## 1. Responsibility & Context

Provides React authentication utilities and TanStack React Query integration for Lagless applications. Handles JWT token persistence, automatic login/instant authentication, player data retrieval, and conditional rendering based on authentication state. Designed for browser-based games that require persistent player identity without requiring traditional sign-up flows.

## 2. Architecture Role

**Upstream dependencies:** `axios` (HTTP client), `@tanstack/react-query` (peer dependency), `@lagless/schemas` (player type definitions)
**Downstream consumers:** `circle-sumo-game` (React frontend)

This module sits at the application layer, providing React-specific abstractions for authentication and data fetching. It wraps TanStack React Query with a singleton client instance and provides authentication hooks that integrate with the Lagless backend API.

## 3. Public API

> **Note:** `auth.context.ts` exists internally but is not exported from `src/index.ts` — it is an implementation detail and not part of the public API.

### Authentication System

- **`api`** — Axios instance pre-configured with `VITE_API_URL` as base URL and automatic Bearer token injection from localStorage. All requests include `Authorization: Bearer <token>` header.

- **`AuthTokenStore`** — Static class for JWT token persistence
  - `AuthTokenStore.get(): string | null` — Retrieve token from localStorage (checks expiry, returns null if expired)
  - `AuthTokenStore.set(token: string, ttlMs?: number): void` — Store token with 30-day default TTL (stored as `ll_auth_token` + `ll_auth_token_expiry`)

### React Query Hooks

- **`useAuthQuery()`** — React Query hook for authentication state. Returns `{ data: { token: string, player: PlayerSchema } }`. Attempts login with existing token, falls back to instant auth if no token or login fails. `staleTime: Infinity`.

- **`usePlayer(): PlayerSchema`** — Convenience hook that extracts player object from `useAuthQuery()`. Returns current authenticated player data.

- **`updatePlayer(): Promise<{ player: PlayerSchema }>`** — Fetch fresh player data from `/player/me` and update the query cache. Use after profile changes to refresh UI.

- **`authQuery()`** — Query factory function returning TanStack React Query configuration object with `queryKey: ['auth']` and `queryFn` for instant authentication flow.

### React Components

- **`ReactQueryProvider`** — Wrapper component that provides TanStack React Query context to the application tree. Uses singleton `currentQueryClient` instance.
  - Props: `{ children: ReactNode }`

- **`currentQueryClient`** — Exported `QueryClient` singleton instance used by `ReactQueryProvider`. Access this to manually manipulate query cache (e.g., `currentQueryClient.setQueryData(['auth'], newData)`).

- **`InstanceAuthContext`** — Conditional rendering component that shows children when authenticated, fallback otherwise.
  - Props: `{ children: ReactNode, fallback: ReactNode }`
  - Uses `useAuthQuery()` internally to check authentication state

## 4. Preconditions

- **Environment variable:** `VITE_API_URL` must be set (e.g., `https://api.example.com`). Used as axios base URL.
- **Backend endpoints required:**
  - `POST /player/login` — Accepts existing token, returns `{ token: string, player: PlayerSchema }`
  - `POST /player/auth/instant` — Creates new player account with JWT, returns `{ token: string, player: PlayerSchema }`
  - `GET /player/me` — Fetch current player data (requires Bearer token header)
- **React application must be wrapped in `ReactQueryProvider`** before using any auth hooks.

## 5. Postconditions

- JWT token persists in localStorage across sessions with 30-day expiry
- All API requests automatically include `Authorization: Bearer <token>` header via axios interceptor
- Authentication state available to all components via `useAuthQuery()` / `usePlayer()` hooks
- First-time users automatically receive a new account via instant auth flow
- Token expiry handled gracefully: expired tokens removed from localStorage and user re-authenticated

## 6. Invariants & Constraints

- **Token storage key:** Always `ll_auth_token` in localStorage (constant `AUTH_TOKEN_KEY`)
- **Expiry storage key:** Always `ll_auth_token_expiry` in localStorage
- **Default TTL:** 30 days (`30 * 24 * 60 * 60 * 1000` ms)
- **Authentication flow order:** (1) Check localStorage for token → (2) Attempt `/player/login` with existing token → (3) Fall back to `/player/auth/instant` if no token or login fails
- **Singleton query client:** Only one `QueryClient` instance exists (`currentQueryClient`)
- **Stale time:** Auth query never refetches automatically (`staleTime: Infinity`) — use `updatePlayer()` to refresh manually
- **Browser-only:** Uses `window.localStorage` and `import.meta.env` (Vite-specific) — not compatible with SSR/Node.js

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT** modify `AuthTokenStore` storage keys (`ll_auth_token`, `ll_auth_token_expiry`) — changing these breaks existing sessions
- **DO NOT** create multiple `QueryClient` instances — always use the exported `currentQueryClient` singleton
- **DO NOT** change `authQuery().staleTime` — authentication should not auto-refetch (use `updatePlayer()` for explicit refresh)
- **DO NOT** use this module in server-side rendering contexts — it relies on `window.localStorage` and browser environment

### Common Mistakes

- **Forgetting `ReactQueryProvider`** — Auth hooks will throw if not wrapped in provider (TanStack React Query requirement)
- **Not setting `VITE_API_URL`** — axios will fail with undefined base URL
- **Manual token manipulation** — Always use `AuthTokenStore.set()` instead of direct `localStorage.setItem()` to ensure expiry is set correctly
- **Assuming immediate auth** — `useAuthQuery()` is async; check for `data` presence before accessing `player`

## 8. Usage Examples

### Basic Setup

```tsx
import { ReactQueryProvider, InstanceAuthContext } from '@lagless/react';

function App() {
  return (
    <ReactQueryProvider>
      <InstanceAuthContext fallback={<LoadingScreen />}>
        <GameUI />
      </InstanceAuthContext>
    </ReactQueryProvider>
  );
}
```

### Using Authentication Hooks

```tsx
import { usePlayer, useAuthQuery } from '@lagless/react';

function PlayerProfile() {
  const player = usePlayer(); // PlayerSchema

  return <div>Welcome, {player.username}!</div>;
}

function AuthStatus() {
  const { data, isLoading } = useAuthQuery();

  if (isLoading) return <div>Authenticating...</div>;
  if (!data) return <div>Not authenticated</div>;

  return <div>Logged in as {data.player.username}</div>;
}
```

### Manual Player Refresh

```tsx
import { updatePlayer } from '@lagless/react';

async function handleProfileUpdate() {
  // After changing player data on backend
  await api.patch('/player/profile', { username: 'NewName' });

  // Refresh cached player data
  await updatePlayer();
  // UI components using usePlayer() will now show updated data
}
```

### Custom API Requests

```tsx
import { api } from '@lagless/react';

async function fetchLeaderboard() {
  const response = await api.get('/leaderboard');
  // Request automatically includes Authorization header
  return response.data;
}
```

## 9. Testing Guidance

No test suite currently exists for this module. When adding tests, consider:

- Mock `axios` for API call testing
- Mock `localStorage` for token persistence testing
- Use `@testing-library/react` with `@tanstack/react-query` testing utilities for hook tests
- Test authentication flow: existing token → login success, existing token → login fail → instant auth, no token → instant auth
- Test token expiry logic: expired tokens should be removed and user re-authenticated
- Test `InstanceAuthContext` conditional rendering with mocked auth state

## 10. Change Checklist

When modifying this module:

1. **Changing token storage keys:** Update both `AuthTokenStore` constants AND any backend services that read these keys from cookies/headers
2. **Modifying authentication flow:** Ensure backend endpoints (`/player/login`, `/player/auth/instant`) still match expected request/response formats
3. **Adding new API endpoints:** Use the exported `api` instance for consistency (automatic token injection)
4. **Changing query keys:** Update `authQuery().queryKey` and any manual cache manipulation using `currentQueryClient.setQueryData(['auth'], ...)`
5. **Adding new hooks:** Follow TanStack React Query conventions (e.g., `useQuery`, `useMutation`)
6. **Browser API changes:** Verify `localStorage` and `import.meta.env` compatibility if targeting new environments

## 11. Integration Notes

### With Backend API

Backend must implement:
- **POST /player/login** — Accept Bearer token in header, validate, return `{ token: string, player: PlayerSchema }`. On failure, return 401 to trigger instant auth fallback.
- **POST /player/auth/instant** — Generate new player account and JWT, return `{ token: string, player: PlayerSchema }`. Always succeeds.
- **GET /player/me** — Return current player data based on Bearer token in `Authorization` header.

### With React Applications

1. Wrap root component in `ReactQueryProvider`
2. Use `InstanceAuthContext` for conditional rendering based on auth state
3. Access player data via `usePlayer()` or `useAuthQuery()` in any component
4. Use `api` instance for backend requests (automatic token injection)
5. Call `updatePlayer()` after backend mutations to refresh cached player state

### With TanStack React Query

- Uses peer dependency `@tanstack/react-query` ^5.90.9
- Singleton `currentQueryClient` can be extended with additional queries/mutations
- Auth query uses `queryKey: ['auth']` — safe to add other queries without conflicts
- `staleTime: Infinity` on auth query prevents unnecessary refetches — authentication happens once per session

## 12. Appendix

### Authentication Flow Diagram

```
1. Component mounts → useAuthQuery() called
2. Check AuthTokenStore.get()
   ├─ Token exists? → POST /player/login with token
   │   ├─ Success? → Return { token, player }
   │   └─ Fail? → POST /player/auth/instant → Return new { token, player }
   └─ No token? → POST /player/auth/instant → Return new { token, player }
3. Store token via AuthTokenStore.set()
4. Query cache updated with { token, player }
5. All components using usePlayer()/useAuthQuery() re-render with auth data
```

### Token Storage Schema

| Key | Value | Purpose |
|-----|-------|---------|
| `ll_auth_token` | JWT string | Bearer token for API authentication |
| `ll_auth_token_expiry` | Unix timestamp (ms) | Token expiration time (30 days from creation) |

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | Yes | None | Backend API base URL (e.g., `https://api.lagless.com`) |

### PlayerSchema Type

Defined in `@lagless/schemas` (not part of this module). Expected structure:

```typescript
interface PlayerSchema {
  username: string;
  // ...additional player fields from backend
}
```

Exact schema depends on backend implementation. Refer to `@lagless/schemas` package for complete type definition.
