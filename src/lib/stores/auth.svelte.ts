import { browser } from '$app/environment';
import { cacheStore } from '$lib/stores/cache.svelte';
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, TOKEN_REFRESH_MARGIN_MS, SESSION_JWT_KEY } from '$lib/config/auth';
import { trackEvent } from '$lib/analytics';

export interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  expiresAt: number | null;
  jwt: string | null;
  isLoading: boolean;
  error: string | null;
}

function createAuthStore() {
  let state = $state<AuthState>({
    user: null,
    accessToken: null,
    expiresAt: null,
    jwt: null,
    isLoading: true,
    error: null,
  });

  let initPromise: Promise<void> | null = null;
  let codeClient: google.accounts.oauth2.CodeClient | null = null;
  let refreshPromise: Promise<boolean> | null = null;

  // ============================================================
  // Initialization
  // ============================================================

  async function initialize() {
    if (!browser) return;
    if (initPromise) return initPromise;
    initPromise = doInitialize();
    return initPromise;
  }

  async function doInitialize() {
    try {
      // Restore JWT from localStorage
      const savedJwt = localStorage.getItem(SESSION_JWT_KEY);
      if (!savedJwt) {
        state.isLoading = false;
        await initGisClient();
        return;
      }

      // Decode JWT for instant UI (user data from claims)
      const user = decodeJwtUser(savedJwt);
      if (user) {
        state.user = user;
        state.jwt = savedJwt;
      }

      // Refresh access token from server
      const refreshed = await doRefreshToken(savedJwt);
      if (!refreshed) {
        // JWT expired or session invalid — clear and require re-login
        clearSession();
      }

      state.isLoading = false;
      await initGisClient();
    } catch {
      state.isLoading = false;
    }
  }

  // ============================================================
  // GIS Code Client
  // ============================================================

  async function initGisClient() {
    try {
      await waitForGis();
      codeClient = google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        ux_mode: 'popup',
        callback: handleCodeResponse,
        error_callback: handleCodeError,
      });
    } catch {
      // GIS not available
    }
  }

  async function handleCodeResponse(response: google.accounts.oauth2.CodeResponse) {
    if (response.error) {
      state.isLoading = false;
      state.error = `Error de autenticacion: ${response.error}`;
      return;
    }

    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: response.code,
          redirectUri: 'postmessage',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Token exchange failed');
      }

      const data = await res.json();

      state.jwt = data.jwt;
      state.accessToken = data.accessToken;
      state.expiresAt = Date.now() + data.expiresIn * 1000;
      state.user = data.user;
      state.error = null;

      localStorage.setItem(SESSION_JWT_KEY, data.jwt);
      trackEvent('login_success');
    } catch (e) {
      state.error = e instanceof Error ? e.message : 'Error al iniciar sesion';
    } finally {
      state.isLoading = false;
    }
  }

  function handleCodeError(error: google.accounts.oauth2.ErrorResponse) {
    if (state.isLoading) {
      state.isLoading = false;
      return;
    }
    state.error = `Error de autenticacion: ${error.message}`;
    trackEvent('login_error', { error_type: error.type ?? 'unknown' });
  }

  // ============================================================
  // Sign in / Sign out
  // ============================================================

  function signIn() {
    if (!browser || !codeClient) return;
    state.isLoading = true;
    state.error = null;
    codeClient.requestCode();
  }

  async function signOut() {
    trackEvent('logout');

    // Revoke refresh token server-side
    if (state.jwt) {
      try {
        await fetch('/api/auth/revoke', {
          method: 'POST',
          headers: { Authorization: `Bearer ${state.jwt}` },
        });
      } catch { /* best effort */ }
    }

    state.user = null;
    state.accessToken = null;
    state.expiresAt = null;
    state.jwt = null;
    cacheStore.clear();
    clearSession();

    if (browser) window.location.href = '/login';
  }

  // ============================================================
  // Token management
  // ============================================================

  async function ensureValidToken(): Promise<string | null> {
    // Token still valid
    if (state.accessToken && state.expiresAt && state.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return state.accessToken;
    }

    // Try to refresh
    if (state.jwt) {
      const success = await refreshToken();
      if (success) return state.accessToken;
    }

    return null;
  }

  /**
   * Refreshes the access token via the Lambda.
   * Deduplicates concurrent calls — only one in-flight request at a time.
   */
  async function refreshToken(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefreshToken(state.jwt!);
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function doRefreshToken(jwt: string): Promise<boolean> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        });

        if (res.ok) {
          const data = await res.json();
          state.accessToken = data.accessToken;
          state.expiresAt = Date.now() + data.expiresIn * 1000;
          state.error = null;
          return true;
        }

        // 401 means the JWT or session is genuinely invalid — no point retrying
        if (res.status === 401) {
          return false;
        }

        // Server error (5xx) — retry, likely a transient deploy issue
        if (attempt < MAX_RETRIES && res.status >= 500) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }

        return false;
      } catch {
        // Network error (fetch failed) — retry
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        return false;
      }
    }

    return false;
  }

  // ============================================================
  // Session persistence
  // ============================================================

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_JWT_KEY);
    } catch { /* ignore */ }
    state.user = null;
    state.accessToken = null;
    state.expiresAt = null;
    state.jwt = null;
  }

  // ============================================================
  // JWT decoding (no verification — server verifies)
  // ============================================================

  function decodeJwtUser(token: string): User | null {
    try {
      const payloadB64 = token.split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const payload = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(payloadB64), c => c.charCodeAt(0))
        )
      );
      return {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
      };
    } catch {
      return null;
    }
  }

  // ============================================================
  // GIS SDK loader
  // ============================================================

  function waitForGis(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts?.oauth2) {
        resolve();
        return;
      }

      // Load GIS script dynamically
      if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        document.head.appendChild(script);
      }

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof google !== 'undefined' && google.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 100) {
          clearInterval(interval);
          reject(new Error('GIS SDK failed to load'));
        }
      }, 100);
    });
  }

  // ============================================================
  // Debug utilities
  // ============================================================

  async function debugForceExpire({ clearTree = false } = {}) {
    if (!import.meta.env.DEV) return;
    state.accessToken = 'expired-debug-token';
    state.expiresAt = Date.now() - 60_000;
    if (clearTree) {
      await cacheStore.clear();
      const { driveStore } = await import('$lib/stores/drive.svelte');
      driveStore.loadedChildren.clear();
      driveStore.rootNodes = [];
      console.warn('[auth] Arbol y cache limpiados');
    }
    console.warn('[auth] Token forzado a expirar (debug) — el proximo API call disparara auto-refresh.');
  }

  // ============================================================
  // Public API
  // ============================================================

  const isAuthenticated = $derived(!!state.user);
  const isTokenValid = $derived(
    !!state.accessToken &&
    !!state.expiresAt &&
    state.expiresAt > Date.now()
  );

  return {
    get user() { return state.user; },
    get accessToken() { return state.accessToken; },
    get jwt() { return state.jwt; },
    get isLoading() { return state.isLoading; },
    get error() { return state.error; },
    get isAuthenticated() { return isAuthenticated; },
    get isTokenValid() { return isTokenValid; },
    initialize,
    signIn,
    signOut,
    ensureValidToken,
    debugForceExpire,
  };
}

export const authStore = createAuthStore();
