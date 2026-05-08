import { Hono } from 'hono';
import {
	exchangeCode,
	getUserInfo,
	refreshAccessToken,
	revokeToken,
} from '../lib/google-oauth.js';
import { signSessionJwt, verifySessionJwt } from '../lib/jwt.js';
import { touchSession } from '../lib/sessions.js';
import { getStorage } from '../storage/factory.js';

export const authRouter = new Hono();

function extractBearer(authHeader: string | undefined): string | null {
	if (!authHeader?.startsWith('Bearer ')) return null;
	return authHeader.slice(7);
}

authRouter.post('/token', async (c) => {
	let code: string | undefined;
	let redirectUri: string | undefined;
	try {
		const body = (await c.req.json()) as { code?: string; redirectUri?: string };
		code = body.code;
		redirectUri = body.redirectUri;
	} catch {
		return c.json({ error: 'Invalid JSON body' }, 400);
	}

	if (!code || !redirectUri) {
		return c.json({ error: 'Missing code or redirectUri' }, 400);
	}

	try {
		const tokens = await exchangeCode(code, redirectUri);

		if (!tokens.refresh_token) {
			console.warn('No refresh_token received from Google — user may need to re-consent');
		}

		const userInfo = await getUserInfo(tokens.access_token);

		const storage = getStorage();
		await storage.saveSession({
			userId: userInfo.id,
			email: userInfo.email,
			name: userInfo.name,
			picture: userInfo.picture,
			refreshToken: tokens.refresh_token ?? '',
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
		});

		const jwt = await signSessionJwt({
			sub: userInfo.id,
			email: userInfo.email,
			name: userInfo.name,
			picture: userInfo.picture,
		});

		return c.json({
			jwt,
			accessToken: tokens.access_token,
			expiresIn: tokens.expires_in,
			user: {
				id: userInfo.id,
				email: userInfo.email,
				name: userInfo.name,
				picture: userInfo.picture,
			},
		});
	} catch (err) {
		console.error('Auth token exchange failed:', err);
		return c.json({ error: 'Token exchange failed' }, 401);
	}
});

authRouter.post('/refresh', async (c) => {
	const token = extractBearer(c.req.header('authorization'));
	if (!token) return c.json({ error: 'Missing Authorization header' }, 401);

	const payload = await verifySessionJwt(token);
	if (!payload) return c.json({ error: 'Invalid or expired session' }, 401);

	const storage = getStorage();
	const session = await touchSession(storage, payload.sub);
	if (!session) return c.json({ error: 'Session expired due to inactivity' }, 401);
	if (!session.refreshToken) return c.json({ error: 'No refresh token available' }, 401);

	try {
		const { access_token, expires_in } = await refreshAccessToken(session.refreshToken);
		return c.json({ accessToken: access_token, expiresIn: expires_in });
	} catch (err) {
		console.error('Google token refresh failed:', err);
		await storage.deleteSession(payload.sub);
		return c.json({ error: 'Refresh token revoked — please sign in again' }, 401);
	}
});

authRouter.post('/revoke', async (c) => {
	const token = extractBearer(c.req.header('authorization'));
	if (!token) return c.json({ error: 'Missing Authorization header' }, 401);

	const payload = await verifySessionJwt(token);
	if (!payload) return c.json({ error: 'Invalid or expired session' }, 401);

	const storage = getStorage();
	try {
		const session = await touchSession(storage, payload.sub);
		if (session?.refreshToken) await revokeToken(session.refreshToken);
		await storage.deleteSession(payload.sub);
	} catch (err) {
		console.error('Revocation error (non-blocking):', err);
		try {
			await storage.deleteSession(payload.sub);
		} catch {
			/* ignore */
		}
	}

	return c.json({ success: true });
});
