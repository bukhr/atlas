# Browser extension — `atlas-links`

Atlas previews documents in cross-origin iframes (`docs.google.com/.../preview`). When a user clicks a Drive link inside that iframe, the same-origin policy forces the link to open in a new tab. The optional **`atlas-links`** extension fixes this: it intercepts those clicks inside the iframe and tells the parent Atlas app to navigate in-place.

The extension is **optional**. The app works fine without it; users just see Drive links open in new tabs.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Atlas page (your-domain)                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  iframe (docs.google.com/.../preview)                │  │
│  │                                                      │  │
│  │  [Extension content.js running here]                 │  │
│  │   ─ intercepts clicks on <a href="...drive...">      │  │
│  │   ─ postMessage('atlas-navigate', {fileId})  ────────┼──┼──► parent
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  DocumentPreview.svelte handles 'atlas-navigate' →          │
│    driveStore.selectFile(fileId)                            │
└────────────────────────────────────────────────────────────┘
```

## Files

```
browser-extensions/atlas-links/
  manifest.json                # Manifest v3
  content.js                   # Runs in Google Workspace iframes
  app-detect.js                # Runs on the Atlas domain at document_start
  detect.json                  # Web-accessible probe file
  icons/
```

## Handshake protocol

PostMessage names are intentionally namespaced as `atlas-*`:

| Direction | Type | Payload | Purpose |
|---|---|---|---|
| iframe → parent | `atlas-check` | — | "Are you Atlas?" |
| parent → iframe | `atlas-ack` | — | "Yes, you may send me navigation events" |
| iframe → parent | `atlas-navigate` | `{ fileId }` | "User clicked this Drive link" |

The iframe sends `atlas-check` once at startup. It only starts intercepting clicks after receiving `atlas-ack` — so on any non-Atlas page (e.g. opening a Doc directly) the script is a no-op.

The Atlas frontend (`DocumentPreview.svelte`) validates the `event.origin` against an allowlist of Google Workspace domains before honoring `atlas-navigate`.

## Detection from the app

`app-detect.js` runs at `document_start` on the configured app host and sets:

```js
document.documentElement.setAttribute('data-atlas-ext', 'true');
```

The dashboard checks this attribute to decide whether to show an "Install extension" CTA.

## Customization for your deployment

The current `manifest.json` ships with placeholder values:

| Field | Default | Replace with |
|---|---|---|
| `browser_specific_settings.gecko.id` | `atlas-links@example.com` | A Mozilla-registered addon ID you control |
| `content_scripts[1].matches` | `["http://localhost/*"]` | Your real app domain (e.g. `["https://atlas.example.com/*"]`) |

**Phase 7** of the open source migration will introduce a `manifest.template.json` + a build script that fills these placeholders from environment variables. Until then you can edit the manifest manually.

## Distribution

Two approaches:

1. **Public stores** (Chrome Web Store, AMO) — go through the standard review process. Most production users.
2. **Self-hosted** — sign with `web-ext sign --channel=unlisted` against AMO and host the resulting `.xpi` on your own server. The extension's `update_url` in the manifest points at a JSON file on your server that lists the latest signed XPI. See `docs/deployment/aws/github-actions-example.yml` for the workflow that did this when Atlas was deployed on AWS.

## Loading locally for development

**Chrome:** `chrome://extensions` → Developer mode → Load unpacked → pick `browser-extensions/atlas-links/`.

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → pick the `manifest.json`.

## Privacy

The extension reads no data from the page, sends no telemetry, and uses no remote APIs. The only inter-process communication is `postMessage` between the iframe and its parent, both controlled by the user.
