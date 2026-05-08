# Contributing

Thanks for considering a contribution to Atlas.

## Local setup

```bash
# 1. Clone, install
git clone https://github.com/bukhr/atlas.git
cd atlas
npm install

# 2. Configure env
cp .env.example .env
# fill VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VITE_ROOT_FOLDER_ID,
# PUBLIC_APP_URL, JWT_SECRET — see README.md for the OAuth setup.

# 3. Run
npm run dev
```

The dev server runs at <http://localhost:3000> and serves both the SPA and the `/api/*` endpoints (the API is mounted as a Vite middleware via `server/vite-plugin.ts`).

## Project layout

A short tour:

- `src/` — SvelteKit frontend
- `server/` — Hono Node server (auth, folder order, storage adapters)
- `browser-extensions/atlas-links/` — optional Chrome/Firefox companion extension
- `docs/` — architecture, API reference, deployment guides
- `scripts/build-extension.mjs` — renders `manifest.template.json` and `privacy-policy.template.html`

See [docs/architecture.md](docs/architecture.md) for the full code map.

## Quality gates

Before opening a PR:

```bash
npm run check     # svelte-check + tsc
npm run lint      # prettier + eslint
npm run test      # vitest (server unit tests)
npm run build     # full build, both frontend and server bundle
```

If you change UI behavior, please verify the golden flow manually: log in → expand a folder → search → reorder a folder → reload → confirm the order persists.

## Code style

- TypeScript strict mode, no `any` unless documented.
- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no Svelte 3/4 stores.
- Server code uses ESM with explicit `.js` import extensions.
- No comments restating the code; only document the *why* when it isn't obvious.
- Follow the existing Prettier config (`prettier-plugin-svelte`, tabs, single quotes).

## Testing

Unit tests live next to the code as `*.test.ts`. The current focus is on `server/storage/` and `server/lib/` — anything with a clean function boundary. UI components are tested manually for now.

## Adding a storage backend

The `StorageAdapter` interface in `server/storage/adapter.ts` is the contract. Implement the interface, register it in `server/storage/factory.ts` behind a new `STORAGE_DRIVER` value, and add a unit test mirroring `server/__tests__/s3-adapter.test.ts`. No other files should need changes.

## Reporting issues

Please include:
- Steps to reproduce
- What you expected vs. what happened
- Browser + OS (for frontend issues)
- Container vs. local dev (for backend issues)

## Security

Don't open public issues for security vulnerabilities. Email the maintainers privately first.
