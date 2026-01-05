# `@lagless/player`

## What it is
`@lagless/player` is a NestJS module that provides player auth and player data services. It wraps TypeORM entities and exposes guards, services, and controller routes for login and identity.

## Why it exists / when to use it
Use it in backend apps that need Lagless player authentication, token validation, and player lookups. It centralizes auth logic so downstream services can depend on `AuthGuard` and `PlayerService`.

## Public API
- `LaglessPlayerModule`
- `PlayerService`
- `AuthGuard`
- `JwtService`
- `AuthenticatedRequest` and related types

## Typical usage
Circle Sumo uses the guard and request type in a custom controller:

```ts
import { type AuthenticatedRequest, AuthGuard } from '@lagless/player';

@UseGuards(AuthGuard)
@Put('equipSkin/:skinId')
public async equipSkin(@Req() req: AuthenticatedRequest) {
  return this._SumoPlayerService.equipSkin(req.authData.id, skinId);
}
```

## Key concepts & data flow
- `AuthGuard` verifies JWT tokens and populates `req.authData`.
- `PlayerService` handles player lookup and login flows.
- Entities come from `@lagless/schemas` and are accessed via TypeORM.

## Configuration and environment assumptions
- Requires NestJS and TypeORM.
- `JWT_SECRET` must be configured in the backend environment.

## Pitfalls / common mistakes
- Using `AuthGuard` without importing `LaglessPlayerModule`.
- Changing auth token payload without updating `AuthenticatedRequest` types.
- Forgetting to register `PlayerSchema` in TypeORM modules.

## Related modules
- `libs/api/schemas` for the `PlayerSchema` and `LoginLogSchema` entities.
- `circle-sumo/circle-sumo-backend` for real usage.
