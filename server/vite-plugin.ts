import { getRequestListener } from '@hono/node-server';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { createApp } from './app.js';

/**
 * Vite plugin that mounts the Hono API as middleware during development.
 * Mirrors what dev-api.ts used to do, but reuses the production server code.
 */
export function devApi(): Plugin {
	return {
		name: 'atlas-dev-api',
		apply: 'serve',

		configureServer(server) {
			const env = loadEnv('development', process.cwd(), '');
			for (const [k, v] of Object.entries(env)) {
				if (process.env[k] === undefined) process.env[k] = v;
			}

			const app = createApp();
			const listener = getRequestListener(app.fetch);

			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith('/api/')) return next();
				listener(req, res).catch((err) => {
					console.error('[dev-api] Unhandled error:', err);
					if (!res.headersSent) {
						res.statusCode = 500;
						res.end(JSON.stringify({ error: 'Internal error' }));
					}
				});
			});
		},
	};
}
