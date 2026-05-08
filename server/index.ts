import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';

/**
 * Standalone production entry: serves the SvelteKit static build alongside
 * the API. The container exposes a single port (default 3000) for both.
 */

const STATIC_DIR = process.env.STATIC_DIR ?? './build';
const PORT = Number(process.env.PORT ?? 3000);

const root = new Hono();
const api = createApp();

root.route('/', api);
root.use('/*', serveStatic({ root: STATIC_DIR }));
root.get('/*', serveStatic({ path: `${STATIC_DIR}/index.html` }));

serve({ fetch: root.fetch, port: PORT }, (info) => {
	console.log(`Atlas server listening on http://localhost:${info.port}`);
});
