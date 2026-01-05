# AGENTS: @lagless/react

## Purpose and boundaries
- Provide React-facing auth and API helpers for Lagless web clients.
- Not responsible for backend logic or server-side authentication.

## Imports and entry points
- `libs/react/src/index.ts`
- `libs/react/src/lib/auth/api.ts`
- `libs/react/src/lib/auth/auth.query.ts`
- `libs/react/src/lib/auth/auth-token-store.ts`
- `libs/react/src/lib/auth/instance-auth.provider.tsx`
- `libs/react/src/lib/react-query.provider.tsx`

## Common tasks -> files
- Adjust API base URL or headers: `auth/api.ts`.
- Change auth flow or query keys: `auth/auth.query.ts`.
- Update token persistence: `auth/auth-token-store.ts`.
- Adjust provider behavior: `instance-auth.provider.tsx`.
- Update exports: `src/index.ts`.

## Integration points
- Circle Sumo frontend uses providers and `usePlayer` (`circle-sumo/circle-sumo-game/src/app/app.tsx`).
- Backend schemas live in `libs/api/schemas` and influence the `PlayerSchema` types.

## Invariants and rules
- `api` must include auth headers derived from `AuthTokenStore`.
- `useAuthQuery` should keep the `['auth']` query key stable.
- Avoid breaking changes to `AuthTokenStore` without updating callers.

## Workflow for modifications
- Update implementation and types, then update Circle Sumo usage if signatures change.
- If auth flow changes, update README and any frontend flows depending on it.
- Verify with `nx lint @lagless/react` and `nx typecheck @lagless/react`.

## Example future AI tasks
1) Add refresh-token support: update `auth.query.ts` and `auth-token-store.ts`, update README and callers.
2) Add a `useAuthToken` hook: implement in `auth.query.ts`, export, document.
3) Add API error retry logic: update `api.ts` and document expected behavior.
