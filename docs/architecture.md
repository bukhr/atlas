# Architecture

Atlas is a hierarchical viewer for Google Drive shared folders. It runs as a single Node container that serves both a static SvelteKit SPA and the API the SPA needs.

## Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                               │
│  - SvelteKit 5 + Svelte runes                                      │
│  - Calls Google Drive API directly with the user's access token    │
│  - Calls /api/* on same origin for auth + folder order             │
│  - Two-level cache: memory + IndexedDB (localforage)               │
└──────────────────────┬─────────────────────────────────────────────┘
                       │ same origin
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Atlas Node container                             │
│                                                                     │
│  Hono app routes:                                                   │
│    POST /api/auth/{token,refresh,revoke}    Sign-in flow            │
│    GET  /api/folder-order/:id               Read manual order       │
│    PUT  /api/folder-order/:id               Save manual order       │
│    GET  /*                                  SPA (build/)            │
│                                                                     │
│  Server-side responsibilities:                                      │
│    - Exchange OAuth codes with Google                               │
│    - Sign and verify JWTs                                           │
│    - Persist refresh tokens & folder order via StorageAdapter       │
│    - Validate folder permissions against Drive API on writes        │
└──────────────────────┬─────────────────────────────────────────────┘
                       │
            ┌──────────┴──────────────┐
            ▼                         ▼
   ┌────────────────────┐    ┌──────────────────────┐
   │ FilesystemAdapter  │    │ S3Adapter (optional) │
   │  ./data/...        │    │  s3://bucket/...     │
   └────────────────────┘    └──────────────────────┘
```

## Code map

```
src/                              # Frontend (SvelteKit)
  routes/
    +layout.svelte                # Root layout
    +page.svelte                  # / → redirect to /d
    login/+page.svelte            # OAuth entry point
    d/[...path]/+page.svelte      # Main dashboard (tree + preview)
  lib/
    stores/                       # Svelte 5 runes ($state, $derived, $effect)
      auth.svelte.ts              # Session, sign-in, refresh
      drive.svelte.ts             # Tree state and lazy children
      cache.svelte.ts             # 2-level cache wrapper
      search.svelte.ts            # Cross-folder search
      tree.svelte.ts              # UI focus and local filtering
      theme.svelte.ts             # Light / dark
      dragdrop.svelte.ts          # Reorder UI state
      favorites.svelte.ts         # User favorites
    services/
      driveService.ts             # Google Drive API v3 wrapper
      orderService.ts             # /api/folder-order client
    components/
      tree/                       # Virtual tree (VirtualTreeView, TreeNode)
      preview/                    # iframe-based document preview
      search/                     # Search results
      AuthGuard.svelte
      AtlasButton.svelte
      UserProfile.svelte
    config.ts                     # Centralized client config
    config/auth.ts                # OAuth scopes, JWT key
    types/                        # DriveFile, FlatNode, gis.d.ts
    utils/                        # cn, debounce, prefetch, fileTypes, etc.
    analytics.ts                  # GA4 instrumentation

server/                           # Backend (Hono)
  app.ts                          # Routes composition
  index.ts                        # Standalone Node entry (Docker prod)
  vite-plugin.ts                  # Vite middleware (dev)
  config.ts                       # Env-driven server config
  api/
    auth.ts                       # /api/auth/{token,refresh,revoke}
    folder-order.ts               # /api/folder-order/:id GET/PUT
  lib/
    google-oauth.ts               # Code exchange, token refresh, revoke, userinfo
    jwt.ts                        # Sign and verify session JWT
    drive-validator.ts            # checkCapabilities() for folder permissions
    sessions.ts                   # touchSession() with idle timeout
  storage/
    adapter.ts                    # StorageAdapter interface
    filesystem.ts                 # ./data adapter (default)
    s3.ts                         # S3 adapter (optional, with CloudFront invalidation)
    factory.ts                    # Selects adapter from env

browser-extensions/
  atlas-links/                    # Optional companion extension
```

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | SvelteKit 5, TypeScript, Tailwind 4, Skeleton UI 4, Vite 7 | SPA via `adapter-static` |
| Server | Node 22, Hono, esbuild bundle | One file: `dist/server.js` |
| Auth | Google Identity Services (Code flow) + JWT (HS256) | `jose` library |
| Storage | filesystem or S3 | Pluggable `StorageAdapter` |
| Cache (client) | Map + localforage (IndexedDB) | Two levels, LRU eviction |
| Drive | Google Drive API v3 | Read-only scopes |

## Design principles

1. **One container.** No separate frontend/backend services. The same Node process serves the SPA and the API.
2. **Drive is the source of truth.** The server never caches Drive data. Only the manual folder order and user sessions live server-side.
3. **No Drive credentials on the server.** The server validates writes by sending the user's freshly-refreshed access token to Drive — no service account needed.
4. **Pluggable storage.** The `StorageAdapter` interface lets you swap filesystem (default) for S3, or add new backends without touching the rest of the code.
5. **Session JWTs.** The browser holds a JWT signed by the server. The Google refresh token never leaves the server.

## Data flow: reordering a folder

1. User drags a folder in the tree → optimistic UI update.
2. Frontend `PUT /api/folder-order/:id` with `Authorization: Bearer <jwt>`.
3. Server verifies JWT → reads session → refreshes access token with Google.
4. Server calls Drive API `files.get` to check `capabilities.canAddChildren` on the folder.
5. If allowed: `StorageAdapter.writeOrder()`. If S3 + CloudFront configured: also issue an invalidation.
6. Server responds 200, frontend confirms; otherwise frontend rolls back.

## Data flow: tree expansion

1. User expands a folder → `driveStore.loadChildren(folderId)`.
2. Cache lookup: memory → IndexedDB.
3. On miss: `driveService.listFiles(folderId)` calls Drive directly with the access token.
4. In parallel: `orderService.getOrder(folderId)` calls `/api/folder-order/:id`.
5. Children are sorted by the saved order (when present) and rendered.
