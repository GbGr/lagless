const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const AUTH_TOKEN_KEY = 'll_auth_token';

export class AuthTokenStore {
  private static _cache: string | null = null;

  public static get() {
    if (this._cache) return this._cache;

    try {
      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      const expiry = window.localStorage.getItem(`${AUTH_TOKEN_KEY}_expiry`);
      if (token && expiry) {
        const expiryTime = parseInt(expiry, 10);
        if (Date.now() < expiryTime) {
          return token;
        } else {
          // Token expired, remove it
          window.localStorage.removeItem('AUTH_TOKEN_KEY');
          window.localStorage.removeItem(`${AUTH_TOKEN_KEY}_expiry`);
        }
      }
    } catch (e) {
      console.error('Failed to retrieve auth token', e);
      return null;
    }
    return null;
  }

  public static set(token: string, ttlMs = TOKEN_TTL_MS) {
    try {
      this._cache = token;
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      const expiryTime = Date.now() + ttlMs;
      window.localStorage.setItem(`${AUTH_TOKEN_KEY}_expiry`, expiryTime.toString());
    } catch (e) {
      console.error('Failed to store auth token', e);
    }
  }
}
