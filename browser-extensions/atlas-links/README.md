# Atlas Links — browser extension

Companion extension that intercepts Google Drive link clicks inside the Atlas iframe preview and routes them back into the app. Optional — Atlas works without it; users just see Drive links open in new tabs.

See [docs/browser-extension.md](../../docs/browser-extension.md) for the architecture and protocol.

## Files

| File | Purpose |
|---|---|
| `manifest.template.json` | Template with `{{...}}` placeholders. Source of truth, committed to git. |
| `manifest.json` | **Generated.** Created by `npm run build:extension`. Gitignored. |
| `content.js` | Runs in Google Workspace iframes. Posts `atlas-navigate` to the parent. |
| `app-detect.js` | Runs at `document_start` on the app host. Sets `data-atlas-ext` on `<html>`. |
| `detect.json` | Web-accessible probe file used as a fallback presence check. |
| `icons/` | Extension icons (16/48/128 px). |

## Build

```bash
npm run build:extension
```

This reads `.env` (or `process.env`) and writes:

- `browser-extensions/atlas-links/manifest.json`
- `static/privacy-policy.html`

It also runs automatically as part of `npm install`, `npm run dev`, and `npm run build`.

## Configuration

| Env var | Purpose | Default |
|---|---|---|
| `EXTENSION_ADDON_ID` | Firefox add-on ID. Required to publish on AMO. | `atlas-links@example.com` |
| `EXTENSION_NAME` | Display name in the extension store. | `Atlas - Links` |
| `PUBLIC_APP_NAME` | Used in the extension description and privacy policy. | `Atlas` |
| `PUBLIC_APP_URL` | Used to derive the host pattern for `app-detect.js`. | `http://localhost:3000` |
| `PUBLIC_CONTACT_EMAIL` | Used in the privacy policy. | (placeholder remains) |

`localhost` is always added to the matches list alongside your configured app URL, so loading the extension unpacked against a local dev server keeps working.

## Loading unpacked

**Chrome:** `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.

**Firefox:** `about:debugging` → This Firefox → "Load Temporary Add-on..." → select `manifest.json`.

You may need to run `npm run build:extension` first if you cloned the repo and haven't installed yet.

## Publishing

For published distribution see the deployment notes in [docs/browser-extension.md](../../docs/browser-extension.md).
