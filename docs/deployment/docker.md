# Docker Deployment

The recommended way to deploy Atlas. The repository ships a single `Dockerfile` and a `docker-compose.yml` that build and run the application as one container exposing port 3000.

## Quick start

```bash
cp .env.example .env
# Fill in VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VITE_ROOT_FOLDER_ID,
# PUBLIC_APP_URL and JWT_SECRET (see Configuration below).

docker compose up --build
```

The app is now available at <http://localhost:3000>.

## What the container does

- Stage 1 (builder): installs dependencies, builds the SvelteKit static site (`build/`), and bundles the Node server with esbuild (`dist/server.js`).
- Stage 2 (runtime): copies only `build/` and `dist/server.js` into a minimal `node:22-alpine` image, runs as non-root user `atlas`, exposes port 3000.

The same Node server serves the static SPA and the `/api/*` endpoints. There is no separate frontend container.

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | yes | — | Public OAuth client ID, baked into the build at build time |
| `GOOGLE_CLIENT_SECRET` | yes | — | Server-only, read at runtime |
| `VITE_ROOT_FOLDER_ID` | yes | — | Drive folder ID used as the tree root, baked at build time |
| `PUBLIC_APP_URL` | yes | `http://localhost:3000` | Used by the OAuth redirect, baked at build time |
| `JWT_SECRET` | yes | — | 32+ random bytes, generate with `openssl rand -base64 32` |
| `PORT` | no | `3000` | Container listening port |
| `STORAGE_DRIVER` | no | `filesystem` | `filesystem` \| `s3` |
| `STORAGE_PATH` | no | `/app/data` | For filesystem |
| `S3_BUCKET`, `S3_REGION` | if `s3` | — | For S3 |
| `CLOUDFRONT_DISTRIBUTION_ID` | no | — | If set with `s3`, invalidates this distribution after writes |

`VITE_*` and `PUBLIC_*` variables are baked at **build time** because Vite inlines them into the static bundle. If you change them you must rebuild the image.

## Persistence

By default `docker-compose.yml` mounts a named volume `atlas-data` at `/app/data`. This directory holds:
- `folder-order/{folderId}.json` — manual folder ordering
- `auth-sessions/{userId}.json` — user refresh tokens

Back this volume up if you care about preserving custom orders and active sessions.

If you want to use S3 instead, set `STORAGE_DRIVER=s3` and provide `S3_BUCKET` / `S3_REGION` in your `.env`. The container needs AWS credentials via the standard chain (env vars, IAM role, etc.).

## Production tips

- Place a TLS-terminating proxy (Caddy, nginx, ALB) in front of the container
- The OAuth client must list your real `PUBLIC_APP_URL` as an authorized origin and redirect URI in Google Cloud Console
- Health endpoint: any `GET /` returns 200 and serves `index.html`
- `HEALTHCHECK` is built into the image (curls `/` every 30s)

## Building manually (without compose)

```bash
docker build \
  --build-arg VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
  --build-arg VITE_ROOT_FOLDER_ID="$VITE_ROOT_FOLDER_ID" \
  --build-arg PUBLIC_APP_URL="$PUBLIC_APP_URL" \
  -t atlas:local .

docker run --rm \
  -p 3000:3000 \
  -e VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
  -e GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  -e JWT_SECRET="$JWT_SECRET" \
  -v atlas-data:/app/data \
  atlas:local
```
