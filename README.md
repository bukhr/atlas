# Atlas

Hierarchical viewer for Google Drive shared folders. Atlas renders a Drive folder as a navigable tree, lets users preview documents inline, search across the folder, and persistently reorder folders to match an editorial structure that does not exist natively in Drive.

## Stack

- **Frontend:** SvelteKit 5 + Svelte runes, TypeScript, Tailwind 4, Skeleton UI 4, Vite 7
- **Backend:** Node + Hono (single binary, bundled with esbuild)
- **Auth:** Google Identity Services (Authorization Code flow), JWT sessions signed server-side
- **Storage:** filesystem (default) or S3 — pluggable via `StorageAdapter`
- **Cache:** two-level (in-memory + IndexedDB via localforage)
- **Deployment:** single Docker container

## Google Cloud setup

Atlas requires a Google Cloud project with OAuth credentials and two APIs enabled.

### 1. Create a project

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a new project (or select an existing one).
2. Note the **Project ID** — you may need it for `gcloud` commands.

### 2. Enable required APIs

In **APIs & Services → Library**, enable:

| API | Identifier | Used for |
|-----|-----------|----------|
| Google Drive API | `drive.googleapis.com` | Listing folders, files, metadata and validating reorder permissions |
| Google Docs API | `docs.googleapis.com` | Inline document preview (headings and tab structure) |

```bash
gcloud services enable drive.googleapis.com docs.googleapis.com
```

> The OAuth2 API (`oauth2.googleapis.com`) is enabled by default and does not need to be added manually.

### 3. Configure the OAuth consent screen

In **APIs & Services → OAuth consent screen**. The console is split into three sub-sections:

**Branding** — Fill in the app name, support email, and (optionally) logo and privacy policy URL. These appear on the Google sign-in prompt shown to users.

**Audience** — Set the user type:
- **Internal** — restricted to users in your Google Workspace org (recommended for company-internal tools).
- **External** — open to any Google account; requires going through Google's verification process if sensitive scopes are used.

**Data Access** — Add the scopes the app requests (`email`, `profile` and `openid` are included by default):
  - `auth/drive.readonly`
  - `auth/drive.metadata.readonly`
  - `auth/documents.readonly`
  - `auth/drive.appdata`

### 4. Create an OAuth client ID

In **APIs & Services → Credentials → Create credentials → OAuth client ID**:

- **Application type:** Web application.
- **Authorized JavaScript origins:** `http://localhost:3000` (add your production domain too).
- **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback` (add your production URL too).

Download or copy the **Client ID** and **Client Secret** — you will need them in the next step.

---

## Quick start (local)

Requires Node 22+, Docker, and the OAuth credentials created above.

1. **Configure the environment.** Copy `.env.example` to `.env` and fill in:
   ```env
   PUBLIC_APP_URL=http://localhost:3000  # The app base URL
   VITE_ROOT_FOLDER_ID=                  # ID of the Drive folder to use as the tree root
   VITE_GOOGLE_CLIENT_ID=                # from Cloud Console
   GOOGLE_CLIENT_SECRET=                 # from Cloud Console
   JWT_SECRET=                           # generate with: openssl rand -base64 32
   ```

2. **Install dependencies and run:**
   ```bash
   npm install
   npm run dev
   ```
   Open <http://localhost:3000>.

3. **Or build and run as a container:**
   ```bash
   docker compose up --build
   ```

## How it works

- The frontend is a static SPA served by the Node container. All API requests go to the same origin (`/api/*`).
- On login, the server exchanges the OAuth code with Google, signs a JWT, and stores the user's refresh token in the configured `StorageAdapter`. The browser only sees the JWT.
- The tree is built lazily from the Google Drive API. Folder order is persisted server-side (per folder) and applied on render.
- Reordering a folder requires Content Manager permission on that folder, validated against the Drive API on every PUT.

## Configuration

All variables are documented in `.env.example`. The most relevant:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PUBLIC_APP_URL` | yes | `http://localhost:3000` | Used by the OAuth redirect |
| `VITE_ROOT_FOLDER_ID` | yes | — | Drive folder ID used as tree root |
| `VITE_GOOGLE_CLIENT_ID` | yes | — | Public OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | yes | — | Server-only |
| `JWT_SECRET` | yes | — | 32+ random bytes |
| `STORAGE_DRIVER` | no | `filesystem` | `filesystem` \| `s3` |
| `STORAGE_PATH` | no | `./data` | For filesystem |
| `S3_BUCKET`, `S3_REGION` | if `s3` | — | For S3 |

## Architecture

```
src/
  routes/          SvelteKit routes (login, /, /d/[...path])
  lib/
    stores/        Svelte 5 runes ($state, $derived, $effect)
    services/      driveService, orderService
    components/    tree/, preview/, search/
    config.ts      Centralized client config
    types/         Shared types

server/
  app.ts           Hono app composition
  index.ts         Standalone Node entry (Docker prod)
  vite-plugin.ts   Vite middleware (dev mode)
  api/             auth.ts, folder-order.ts
  storage/         StorageAdapter + filesystem + s3 implementations
  lib/             jwt, google-oauth, drive-validator, sessions

browser-extensions/
  atlas-links/     Optional Chrome/Firefox extension that
                   redirects Drive links back into Atlas
```

## Deployment

- **Docker (recommended):** `docker compose up --build`. Persists data to a Docker volume.
- **AWS Serverless example:** see `docs/deployment/aws/` for an alternative deployment using S3 + CloudFront + Lambda.

## Browser extension

`browser-extensions/atlas-links/` is an optional companion extension that intercepts clicks on Google Drive links inside Atlas previews and redirects them back into the app. See `docs/browser-extension.md`.

## Development

- `npm run dev` — Vite dev server with API middleware
- `npm run build` — SvelteKit static build + bundled Node server
- `npm run start` — run the bundled server (assumes `npm run build` first)
- `npm run test` — Vitest unit tests
- `npm run check` — Svelte + TypeScript type check
- `npm run lint` — Prettier + ESLint

## Maintained by

Atlas is maintained by [Buk](https://github.com/bukhr). It is open source under the license at the root of this repository.
