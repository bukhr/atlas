import { Hono } from 'hono';
import { authRouter } from './api/auth.js';
import { folderOrderRouter } from './api/folder-order.js';

/**
 * Builds the Hono app exposing /api/auth/* and /api/folder-order/*.
 * Used both by the standalone Node server (production) and the Vite
 * middleware (development).
 */
export function createApp(): Hono {
	const app = new Hono();
	app.route('/api/auth', authRouter);
	app.route('/api/folder-order', folderOrderRouter);
	return app;
}
