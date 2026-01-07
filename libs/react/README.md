# @lagless/react

React utilities for the Lagless framework. Provides authentication context, token storage, and React Query integration.

## Installation

```bash
pnpm add @lagless/react @tanstack/react-query
```

## Overview

This module provides:

- **Authentication**: Context, hooks, and token storage
- **React Query Provider**: Pre-configured TanStack Query setup
- **API Utilities**: Auth API helpers

## Authentication

### Setup

```tsx
import { InstanceAuthProvider, ReactQueryProvider } from '@lagless/react';

function App() {
  return (
    <ReactQueryProvider>
      <InstanceAuthProvider>
        <GameContent />
      </InstanceAuthProvider>
    </ReactQueryProvider>
  );
}
```

### Using Auth Context

```tsx
import { useContext } from 'react';
import { AuthContext } from '@lagless/react';

function UserProfile() {
  const { player, token } = useContext(AuthContext);

  return (
    <div>
      <h1>{player.username}</h1>
      <p>ID: {player.id}</p>
    </div>
  );
}
```

### Auth Hook

```tsx
import { useAuth } from '@lagless/react';

function GameLobby() {
  const { player, isLoading, error } = useAuth();

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return <Lobby player={player} />;
}
```

### Token Storage

```typescript
import { AuthTokenStore } from '@lagless/react';

// Get stored token
const token = AuthTokenStore.getToken();

// Store token
AuthTokenStore.setToken(newToken);

// Clear token
AuthTokenStore.clearToken();

// Check if token exists
if (AuthTokenStore.hasToken()) {
  // Auto-login...
}
```

## React Query Provider

Pre-configured TanStack Query:

```tsx
import { ReactQueryProvider } from '@lagless/react';

function App() {
  return (
    <ReactQueryProvider>
      <YourApp />
    </ReactQueryProvider>
  );
}
```

### Custom Configuration

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  );
}
```

## Auth API

```typescript
import { authApi } from '@lagless/react';

// Login
const { player, token } = await authApi.login(credentials);

// Register
const { player, token } = await authApi.register(userData);

// Get current player
const player = await authApi.me(token);

// Refresh token
const newToken = await authApi.refresh(token);
```

## Types

```typescript
interface AuthContextType {
  player: PlayerSchema;
  token: string;
}

interface PlayerSchema {
  id: string;
  username: string;
  // ... other fields from @lagless/schemas
}
```

## Usage with Circle Sumo

```tsx
// app.tsx
import { ReactQueryProvider, InstanceAuthProvider } from '@lagless/react';

function App() {
  return (
    <ReactQueryProvider>
      <InstanceAuthProvider>
        <FtueProvider>
          <AssetsLoader>
            <RouterProvider router={router} />
          </AssetsLoader>
        </FtueProvider>
      </InstanceAuthProvider>
    </ReactQueryProvider>
  );
}

// In game components
function GameScreen() {
  const { player } = useContext(AuthContext);

  // Use player data for game initialization
  const skinId = player.selectedSkinId;
  const mmr = player.mmr;
}
```

## Persistence

Auth tokens are persisted to localStorage:

```typescript
// Automatic on login
AuthTokenStore.setToken(token);

// Retrieved on app start
const storedToken = AuthTokenStore.getToken();
if (storedToken) {
  // Validate and restore session
}
```

## Error Handling

```tsx
function AuthBoundary({ children }) {
  const { error, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    // Token expired or invalid
    AuthTokenStore.clearToken();
    return <LoginScreen />;
  }

  return children;
}
```
