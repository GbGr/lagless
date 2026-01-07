# AGENTS.md - @lagless/react

AI coding guide for the React utilities module.

## Module Purpose

React integration utilities:
- Authentication context and hooks
- Token persistence
- React Query setup
- Auth API helpers

## Key Exports

```typescript
// Context
export const AuthContext: Context<AuthContextType>;
export type AuthContextType = { player: PlayerSchema; token: string };

// Provider
export const InstanceAuthProvider: FC<{ children: ReactNode }>;

// React Query
export const ReactQueryProvider: FC<{ children: ReactNode }>;

// Hooks
export function useAuth(): { player, token, isLoading, error };

// Token Storage
export const AuthTokenStore: {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
  hasToken(): boolean;
};

// API
export const authApi: {
  login(credentials): Promise<AuthResponse>;
  register(data): Promise<AuthResponse>;
  me(token): Promise<PlayerSchema>;
  refresh(token): Promise<string>;
};
```

## Provider Setup

### Recommended Order

```tsx
function App() {
  return (
    <ReactQueryProvider>           {/* 1. Query caching */}
      <InstanceAuthProvider>       {/* 2. Auth state */}
        <OtherProviders>           {/* 3. App-specific */}
          <RouterProvider />
        </OtherProviders>
      </InstanceAuthProvider>
    </ReactQueryProvider>
  );
}
```

## AuthContext

### Type

```typescript
interface AuthContextType {
  player: PlayerSchema;  // From @lagless/schemas
  token: string;         // JWT
}
```

### Usage

```tsx
import { useContext } from 'react';
import { AuthContext } from '@lagless/react';

function Component() {
  const { player, token } = useContext(AuthContext);

  // player.id, player.username, player.mmr, etc.
}
```

## AuthTokenStore

### Persistence

```typescript
// On login
AuthTokenStore.setToken(response.token);

// On app start
const token = AuthTokenStore.getToken();
if (token) {
  // Attempt auto-login
  try {
    const player = await authApi.me(token);
    // Restore session
  } catch {
    AuthTokenStore.clearToken();
    // Show login
  }
}

// On logout
AuthTokenStore.clearToken();
```

### Storage Key

Tokens stored in `localStorage` with key: `lagless_auth_token`

## Auth Flow

### Login

```typescript
async function login(username: string, password: string) {
  const { player, token } = await authApi.login({ username, password });
  AuthTokenStore.setToken(token);
  return { player, token };
}
```

### Auto-Login

```tsx
function InstanceAuthProvider({ children }) {
  const [auth, setAuth] = useState<AuthContextType | null>(null);

  useEffect(() => {
    const token = AuthTokenStore.getToken();
    if (!token) return;

    authApi.me(token)
      .then(player => setAuth({ player, token }))
      .catch(() => AuthTokenStore.clearToken());
  }, []);

  if (!auth) return <LoginScreen />;

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Guest/Anonymous

```typescript
async function loginAsGuest() {
  const { player, token } = await authApi.register({
    username: `Guest_${Math.random().toString(36).slice(2, 8)}`,
    isGuest: true,
  });
  AuthTokenStore.setToken(token);
  return { player, token };
}
```

## React Query Integration

### Default Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,      // 1 minute
      gcTime: 1000 * 60 * 5,     // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Custom Queries

```tsx
import { useQuery } from '@tanstack/react-query';

function usePlayerSkins() {
  const { token } = useContext(AuthContext);

  return useQuery({
    queryKey: ['player-skins'],
    queryFn: () => fetchSkins(token),
  });
}
```

## File Structure

```
libs/react/src/lib/
├── auth/
│   ├── auth.context.ts        # AuthContext
│   ├── auth.query.ts          # useAuth hook
│   ├── auth-token-store.ts    # Token persistence
│   ├── api.ts                 # Auth API calls
│   └── instance-auth.provider.tsx
└── react-query.provider.tsx
```

## Common Patterns

### Protected Route

```tsx
function ProtectedRoute({ children }) {
  const { player } = useContext(AuthContext);

  if (!player) {
    return <Navigate to="/login" />;
  }

  return children;
}
```

### Auth Header

```typescript
function createAuthHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// In API calls
const response = await fetch(url, {
  headers: createAuthHeader(token),
});
```

### Logout

```tsx
function LogoutButton() {
  const navigate = useNavigate();

  const handleLogout = () => {
    AuthTokenStore.clearToken();
    navigate('/login');
    // Force page reload to clear all state
    window.location.reload();
  };

  return <button onClick={handleLogout}>Logout</button>;
}
```

## DO's and DON'Ts

### DO

- Wrap app with ReactQueryProvider and InstanceAuthProvider
- Check token on app start
- Clear token on auth errors
- Use useContext for auth access

### DON'T

- Store sensitive data besides token
- Trust token without validation
- Forget to handle loading states
- Access AuthContext outside provider
