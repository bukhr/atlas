# Google Analytics 4

Atlas ships with optional GA4 instrumentation. Set `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` to enable it; leave it empty to skip GA entirely.

## Implementation

GA4 is loaded programmatically (not as a static `<script>` tag). The module lives in `src/lib/analytics.ts` and exposes:

- `initGA()` — Injects the gtag.js script and configures GA4. Called once in `onMount` of the root layout (`src/routes/+layout.svelte`).
- `trackEvent(eventName, params?)` — Sends a custom event to GA4.

If `VITE_GA_MEASUREMENT_ID` is empty, both functions short-circuit and no script is loaded.

## Content Security Policy

For the script to load, the deployment's CSP must allow `https://www.googletagmanager.com` in `script-src`. The CloudFormation template in `docs/deployment/aws/cloudformation.yaml` already includes this; if you put Atlas behind a different proxy, mirror that allowance.

## Events tracked

| Event | Description | Params | Source |
|---|---|---|---|
| `login_intent` | Click on "Sign in with Google" | — | `src/routes/login/+page.svelte` |
| `login_success` | Login completed, user info fetched | — | `src/lib/stores/auth.svelte.ts` |
| `login_error` | Error in the auth flow | `error_type` | `src/lib/stores/auth.svelte.ts` |
| `logout` | User signs out | — | `src/lib/stores/auth.svelte.ts` |
| `search` | Search executed (debounced, min 2 chars) | `search_term`, `search_mode` | `src/lib/stores/search.svelte.ts` |
| `file_open` | File selected for preview | `file_type`, `file_name` | `src/lib/stores/drive.svelte.ts` |
| `folder_expand` | Folder expanded in the tree | `folder_name` | `src/lib/stores/drive.svelte.ts` |
| `reorder_attempt` | Drag-and-drop reorder | `folder_id` | `src/lib/stores/drive.svelte.ts` |
| `reorder_error` | Error persisting the new order | `error` | `src/lib/stores/drive.svelte.ts` |
| `share_link` | "Share" click (copies URL to clipboard) | `file_name` | `src/lib/components/preview/DocumentPreview.svelte` |
| `open_in_drive` | "Open in Drive" click | `file_name` | `src/lib/components/preview/DocumentPreview.svelte` |
| `theme_toggle` | Theme change | `theme` | `src/lib/stores/theme.svelte.ts` |

GA4 also automatically tracks `page_view` after `gtag('config', ...)`.

To add new events, import `trackEvent` from `$lib/analytics` and call it where appropriate.
