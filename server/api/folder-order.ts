import { Hono } from 'hono';
import { checkCapabilities } from '../lib/drive-validator.js';
import { refreshAccessToken } from '../lib/google-oauth.js';
import { verifySessionJwt } from '../lib/jwt.js';
import { touchSession } from '../lib/sessions.js';
import { getStorage } from '../storage/factory.js';

export const folderOrderRouter = new Hono();

function extractBearer(authHeader: string | undefined): string | null {
	if (!authHeader?.startsWith('Bearer ')) return null;
	return authHeader.slice(7);
}

folderOrderRouter.get('/:folderId', async (c) => {
	const folderId = c.req.param('folderId');
	if (!folderId) return c.json({ error: 'Missing folderId' }, 400);

	try {
		const data = await getStorage().readOrder(folderId);
		if (!data) return c.json({ error: 'No custom order' }, 404);
		return c.json({ order: data.order });
	} catch (err) {
		console.error('Failed to read folder order:', err);
		return c.json({ error: 'Failed to read order' }, 500);
	}
});

folderOrderRouter.put('/:folderId', async (c) => {
	const rawToken = extractBearer(c.req.header('authorization'));
	if (!rawToken) return c.json({ error: 'Missing or invalid Authorization header' }, 401);

	const folderId = c.req.param('folderId');
	if (!folderId) return c.json({ error: 'Missing folderId' }, 400);

	let order: string[];
	try {
		const body = (await c.req.json()) as { order?: unknown };
		if (
			!Array.isArray(body.order) ||
			!body.order.every((id: unknown) => typeof id === 'string')
		) {
			return c.json({ error: 'order must be an array of strings' }, 400);
		}
		order = body.order;
	} catch {
		return c.json({ error: 'Invalid JSON body' }, 400);
	}

	const storage = getStorage();

	const jwtPayload = await verifySessionJwt(rawToken);
	if (!jwtPayload) return c.json({ error: 'Invalid or expired session' }, 401);

	const session = await touchSession(storage, jwtPayload.sub);
	if (!session?.refreshToken) return c.json({ error: 'Session expired' }, 401);

	let googleAccessToken: string;
	try {
		const { access_token } = await refreshAccessToken(session.refreshToken);
		googleAccessToken = access_token;
	} catch {
		await storage.deleteSession(jwtPayload.sub);
		return c.json({ error: 'Failed to refresh Google token' }, 401);
	}
	const userEmail = session.email;

	const { allowed, status } = await checkCapabilities(googleAccessToken, folderId);
	if (!allowed) {
		const error =
			status === 401 ? 'Invalid or expired Google token' : 'No permission to reorder this folder';
		return c.json({ error }, status as 401 | 422);
	}

	try {
		await storage.writeOrder(folderId, {
			order,
			updatedAt: new Date().toISOString(),
			...(userEmail && { updatedBy: userEmail }),
		});
	} catch (err) {
		console.error('Failed to write folder order:', err);
		return c.json({ error: 'Failed to save order' }, 500);
	}

	if (storage.invalidateOrderCache) {
		try {
			await storage.invalidateOrderCache(folderId);
		} catch (err) {
			console.error('Failed to invalidate order cache (non-blocking):', err);
		}
	}

	return c.json({ success: true });
});
