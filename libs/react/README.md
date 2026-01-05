# `@lagless/react`

## What it is
`@lagless/react` provides React helpers for Lagless frontends: a configured API client, auth hooks, token storage, and React Query wiring.

## Why it exists / when to use it
Use it in Lagless web clients to share consistent auth and API access patterns. It centralizes token handling and React Query setup.

## Public API
- `api`: Axios instance configured with `VITE_API_URL` and auth header
- `ReactQueryProvider`, `currentQueryClient`: React Query integration
- `AuthTokenStore`: localStorage-backed token store
- `useAuthQuery`, `usePlayer`, `updatePlayer`, `authQuery`
- `InstanceAuthContext`: renders children when auth is ready

## Typical usage
Circle Sumo wraps the app with providers and uses the auth context:

```tsx
import { ReactQueryProvider, InstanceAuthContext } from '@lagless/react';

<ReactQueryProvider>
  <InstanceAuthContext fallback={<LoadingScreen />}>
    <RouterProvider router={router} />
  </InstanceAuthContext>
</ReactQueryProvider>
```

## Key concepts & data flow
- `AuthTokenStore` persists tokens in localStorage.
- `useAuthQuery` performs instant auth and caches the result in React Query.
- `api` adds the Bearer token header for every request.

## Configuration and environment assumptions
- `VITE_API_URL` must be set in the frontend environment.
- Requires browser APIs (`localStorage`, `window`).
- React Query must be available in the app bundle.

## Pitfalls / common mistakes
- Using `api` without wrapping the app in `ReactQueryProvider`.
- Running in SSR without guarding `localStorage` access.
- Forgetting to update cached auth data after mutations.

## Related modules
- `libs/api/player`, `libs/api/game`, `libs/api/schemas` for backend contracts.
- `circle-sumo/circle-sumo-game` for real usage.
