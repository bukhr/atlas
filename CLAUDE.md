# Atlas

Visor jerárquico de carpetas compartidas de Google Drive. Renderiza una carpeta de Drive como árbol navegable con preview inline, búsqueda y reorden persistente de carpetas.

## Stack
- TypeScript, SvelteKit 5 + runes, Tailwind 4, Skeleton UI 4, Vite 7
- Auth: Google Identity Services (Authorization Code flow), JWT firmados server-side
- Backend: Node + Hono, bundled con esbuild (un solo archivo)
- Storage: filesystem (default) o S3 vía `StorageAdapter`
- Iconos: lucide-svelte
- Virtualización: @humanspeak/svelte-virtual-list
- Caché: 2 niveles (memory + IndexedDB via localforage)

## Arquitectura
- `src/routes/` — Rutas: `/` (redirect), `/login`, `/d/[...path]` (dashboard)
- `src/lib/stores/` — Estado reactivo con Svelte 5 runes ($state, $derived, $effect) en archivos `.svelte.ts`
- `src/lib/services/` — `driveService` (Google Drive API), `orderService` (`/api/folder-order`)
- `src/lib/components/` — `tree/`, `preview/`, `search/`
- `src/lib/config.ts` — Config cliente centralizada (rootFolderId, caché TTLs, mime types)
- `server/` — API HTTP (Hono): `/api/auth/*`, `/api/folder-order/*`. StorageAdapter pluggable.
- `browser-extensions/atlas-links/` — Extensión opcional Chrome/Firefox

## Flujo principal
1. Usuario entra → restaura sesión de `localStorage["atlas-jwt"]` o redirige a `/login`
2. Login: server intercambia code con Google, guarda refresh token en storage adapter, devuelve JWT
3. Dashboard: árbol virtual de Drive (lazy loading) + búsqueda global + preview en iframe
4. Drag & drop reordena carpetas → `PUT /api/folder-order/:id` valida capabilities contra Drive API y persiste en storage adapter

## Comandos
- `npm run dev` — Vite dev server (API montada como middleware)
- `npm run build` — SvelteKit estático + bundle del server con esbuild
- `npm run start` — Corre el server bundleado (post-build)
- `npm run test` — Vitest
- `npm run check` — svelte-check + tsc
- `docker compose up --build` — Build y arranque del contenedor

## Convenciones
- Simplicidad por sobre complejidad.
- Frontend 100% estático (adapter-static), servido por el contenedor Node junto con la API.
- Stores usan runes de Svelte 5, NO stores clásicos.
- Utilidades CSS con clsx + tailwind-merge (helper `cn()`).
- Server: handlers en `server/api/`, lógica en `server/lib/`, persistencia en `server/storage/`.

## Testing
- Cuando hagas cambios en funcionalidad o UI, usa el MCP de Playwright para verificar que nada se rompió antes de dar la tarea por terminada.
