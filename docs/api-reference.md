# API Reference

The Atlas server exposes two route families under `/api`. All bodies and responses are JSON.

## Base URL

Same origin as the SPA. In development this is `http://localhost:3000`; in a Docker deployment it's whatever you front the container with.

## Auth header

Authenticated endpoints expect `Authorization: Bearer <jwt>` where `<jwt>` is the value the frontend stored from `POST /api/auth/token`.

---

## `POST /api/auth/token`

Exchange a Google OAuth authorization code for a session JWT.

**Body:**
```json
{
  "code": "<auth code from Google popup>",
  "redirectUri": "<must match what GIS used>"
}
```

**Response 200:**
```json
{
  "jwt": "<HS256 JWT, 90d>",
  "accessToken": "<Google access token, ~1h>",
  "expiresIn": 3599,
  "user": {
    "id": "<google sub>",
    "email": "...",
    "name": "...",
    "picture": "..."
  }
}
```

The server also persists a session record (refresh token + lastUsedAt) keyed by `user.id`.

**Errors:** `400` invalid body · `401` Google rejected the code.

---

## `POST /api/auth/refresh`

Get a fresh Google access token using the stored refresh token.

**Headers:** `Authorization: Bearer <jwt>`

**Response 200:**
```json
{
  "accessToken": "<new access token>",
  "expiresIn": 3599
}
```

**Errors:**
- `401 "Missing Authorization header"`
- `401 "Invalid or expired session"` — JWT verification failed
- `401 "Session expired due to inactivity"` — `touchSession` exceeded 30 days idle
- `401 "No refresh token available"` — session has no refresh token (e.g. user signed in without consent)
- `401 "Refresh token revoked — please sign in again"` — Google rejected the refresh; server has deleted the session

---

## `POST /api/auth/revoke`

Sign the user out: revoke the refresh token at Google and delete the server-side session.

**Headers:** `Authorization: Bearer <jwt>`

**Response 200:** `{ "success": true }`

Always returns 200 even on partial failures — the session is always deleted server-side.

---

## `GET /api/folder-order/:folderId`

Return the saved manual order for a folder, if any.

**No auth required** — the order is considered viewable by anyone who can access the folder.

**Response 200:**
```json
{ "order": ["<fileId1>", "<fileId2>", ...] }
```

**Response 404:** `{ "error": "No custom order" }` — no order saved for this folder.

---

## `PUT /api/folder-order/:folderId`

Save a manual order. Authenticated and gated by Drive permissions.

**Headers:** `Authorization: Bearer <jwt>`

**Body:**
```json
{ "order": ["<fileId1>", "<fileId2>", ...] }
```

The server:
1. Verifies the JWT.
2. Refreshes the user's Google access token.
3. Calls Drive `files.get?fields=capabilities` on `:folderId`.
4. Requires `canAddChildren || canRemoveChildren` (Content Manager or higher).
5. Persists the order via `StorageAdapter.writeOrder()`.
6. If using S3 + CloudFront, issues a cache invalidation for the order key.

**Response 200:** `{ "success": true }`

**Errors:**
- `400` invalid body or missing folderId
- `401` invalid / expired session, or session has no refresh token
- `422 "No permission to reorder this folder"` — user lacks Content Manager rights
- `500` storage failure (write rejected by adapter)

> The `422` is intentional: AWS CloudFront rewrites `403` responses into 200 (it doesn't know they came from the API), so the API uses 422 for permission denials instead.

---

## Error format

All errors share the same shape:

```json
{ "error": "<human-readable string>" }
```

There is no error code field. Check the HTTP status.

---

## Implementation

Routes are defined with [Hono](https://hono.dev) in `server/api/`. The same code runs:

- in development as Vite middleware (`server/vite-plugin.ts`)
- in production as a standalone Node server (`server/index.ts`)

Both call `createApp()` from `server/app.ts` so the route table is identical.
