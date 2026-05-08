# Authentication

Atlas uses **Google Identity Services (GIS) with the Authorization Code flow** + a server-signed JWT session. The Google refresh token never leaves the server; the browser only sees a short JWT.

## Files

| File | Role |
|---|---|
| `server/api/auth.ts` | `/api/auth/{token,refresh,revoke}` handlers |
| `server/lib/google-oauth.ts` | Code exchange, refresh, revoke, `getUserInfo` |
| `server/lib/jwt.ts` | Sign/verify HS256 JWTs (`jose`) |
| `server/lib/sessions.ts` | `touchSession` with idle timeout |
| `src/lib/stores/auth.svelte.ts` | Frontend auth store |
| `src/lib/config/auth.ts` | OAuth scopes and the `atlas-jwt` localStorage key |

## OAuth scopes

```ts
'openid',
'https://www.googleapis.com/auth/userinfo.email',
'https://www.googleapis.com/auth/userinfo.profile',
'https://www.googleapis.com/auth/drive.readonly',
'https://www.googleapis.com/auth/drive.metadata.readonly',
'https://www.googleapis.com/auth/documents.readonly',
'https://www.googleapis.com/auth/drive.appdata',
```

All scopes are read-only. Atlas cannot modify Drive contents.

## Session JWT

| Field | Value |
|---|---|
| Algorithm | HS256 |
| Secret | `JWT_SECRET` env var (32+ random bytes) |
| Issuer | `atlas` |
| Expiration | 90 days |
| Claims | `sub` (Google user ID), `email`, `name`, `picture` |

The frontend stores it in `localStorage["atlas-jwt"]`. The server verifies it on every authenticated call.

## Server session record

Stored by the configured `StorageAdapter` (filesystem at `./data/auth-sessions/{userId}.json`, or S3):

```ts
interface Session {
  userId: string;
  email: string;
  name: string;
  picture: string;
  refreshToken: string;        // Google refresh token (server-only)
  createdAt: string;
  lastUsedAt: string;
}
```

Idle timeout: 30 days. If `lastUsedAt` is older, the session is deleted on the next access.

## Sign-in flow

```
Browser                                  Server                          Google
   │                                        │                              │
   │ 1. authStore.signIn()                  │                              │
   │ ─── GIS code popup ─────────────────────────────────────────────────► │
   │ ◄─── auth code ────────────────────────────────────────────────────── │
   │                                        │                              │
   │ 2. POST /api/auth/token                │                              │
   │     {code, redirectUri}                │                              │
   ├───────────────────────────────────────►│                              │
   │                                        │ 3. token exchange            │
   │                                        ├─────────────────────────────►│
   │                                        │ ◄─── access + refresh ───────│
   │                                        │ 4. getUserInfo(access)       │
   │                                        ├─────────────────────────────►│
   │                                        │ ◄─── user profile ───────────│
   │                                        │ 5. saveSession({refresh,...})│
   │                                        │ 6. signSessionJwt(user)      │
   │ ◄── 200 {jwt, accessToken, user} ─────│                              │
   │                                        │                              │
   │ 7. Persist jwt in localStorage         │                              │
   │    Use accessToken for Drive directly  │                              │
```

## Refresh flow

The browser holds the JWT (long-lived) and the access token (~1 hour). When the access token nears expiration the frontend calls `/api/auth/refresh`.

```
Browser                                  Server                          Google
   │ POST /api/auth/refresh                 │                              │
   │   Authorization: Bearer <jwt>          │                              │
   ├───────────────────────────────────────►│                              │
   │                                        │ verifySessionJwt → sub       │
   │                                        │ touchSession (idle check,    │
   │                                        │   updates lastUsedAt)        │
   │                                        │ refreshAccessToken(refresh)  │
   │                                        ├─────────────────────────────►│
   │                                        │ ◄─── new access ─────────────│
   │ ◄── 200 {accessToken, expiresIn} ──────│                              │
```

If refresh fails (token revoked, idle expired), the server deletes the session and responds 401. The frontend then forces a fresh sign-in.

## Sign-out

```
POST /api/auth/revoke
  Authorization: Bearer <jwt>

Server: verify JWT → revoke refresh token at Google → delete session record → 200
Frontend: clear localStorage["atlas-jwt"] → redirect /login
```

The revoke step is best-effort: the session is always deleted server-side even if the Google call fails.

## Drive permission check (writes only)

When the frontend issues `PUT /api/folder-order/:id`, the server:

1. Verifies the JWT and refreshes the user's access token.
2. Calls Drive `files.get?fields=capabilities` for the target folder.
3. Allows the write only if `canAddChildren || canRemoveChildren` (i.e. Content Manager or higher).

This means the server has no Drive privilege of its own — every authorization check uses the user's own token.

## Configuration

| Env var | Used by |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Frontend (build-time inline) and server |
| `GOOGLE_CLIENT_SECRET` | Server only |
| `JWT_SECRET` | Server only — generate with `openssl rand -base64 32` |
| `PUBLIC_APP_URL` | Frontend (passed to OAuth redirect) |

Restrict the OAuth client in Google Cloud Console to your real `PUBLIC_APP_URL` as both an authorized origin and redirect URI.
