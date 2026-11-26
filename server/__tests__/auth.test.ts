import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesystemAdapter } from '../storage/filesystem.js';

const oauthMocks = vi.hoisted(() => ({
	exchangeCode: vi.fn(),
	getUserInfo: vi.fn(),
	refreshAccessToken: vi.fn(),
	revokeToken: vi.fn()
}));

const storageRef = vi.hoisted(() => ({
	current: null as FilesystemAdapter | null
}));

vi.mock('../lib/google-oauth.js', () => oauthMocks);
vi.mock('../storage/factory.js', () => ({
	getStorage: () => {
		if (!storageRef.current) throw new Error('Test storage not initialized');
		return storageRef.current;
	}
}));

import { authRouter } from '../api/auth.js';

describe('authRouter /token refresh token persistence', () => {
	let dir: string;
	let adapter: FilesystemAdapter;
	let prevSecret: string | undefined;

	beforeEach(async () => {
		prevSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
		dir = await mkdtemp(join(tmpdir(), 'atlas-auth-test-'));
		adapter = new FilesystemAdapter(dir);
		storageRef.current = adapter;
		vi.clearAllMocks();
	});

	afterEach(async () => {
		storageRef.current = null;
		if (prevSecret === undefined) delete process.env.JWT_SECRET;
		else process.env.JWT_SECRET = prevSecret;
		await rm(dir, { recursive: true, force: true });
	});

	it('preserves stored refreshToken and createdAt when Google omits refresh_token on re-login', async () => {
		oauthMocks.getUserInfo.mockResolvedValue({
			id: 'user-123',
			email: 'dev@buk.cl',
			name: 'Dev User',
			picture: 'https://example.com/pic.png'
		});

		oauthMocks.exchangeCode.mockResolvedValueOnce({
			access_token: 'access-1',
			refresh_token: 'refresh-initial',
			expires_in: 3600,
			token_type: 'Bearer'
		});

		const firstRes = await authRouter.request('/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'code-1', redirectUri: 'postmessage' })
		});
		expect(firstRes.status).toBe(200);

		const firstSession = await adapter.getSession('user-123');
		expect(firstSession?.refreshToken).toBe('refresh-initial');
		const initialCreatedAt = firstSession?.createdAt;
		expect(initialCreatedAt).toBeTruthy();

		oauthMocks.exchangeCode.mockResolvedValueOnce({
			access_token: 'access-2',
			expires_in: 3600,
			token_type: 'Bearer'
		});

		const secondRes = await authRouter.request('/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'code-2', redirectUri: 'postmessage' })
		});
		expect(secondRes.status).toBe(200);
		const secondBody = (await secondRes.json()) as { jwt: string };

		const preservedSession = await adapter.getSession('user-123');
		expect(preservedSession?.refreshToken).toBe('refresh-initial');
		expect(preservedSession?.createdAt).toBe(initialCreatedAt);

		oauthMocks.refreshAccessToken.mockResolvedValueOnce({
			access_token: 'access-refreshed',
			expires_in: 3600
		});

		const refreshRes = await authRouter.request('/refresh', {
			method: 'POST',
			headers: { Authorization: `Bearer ${secondBody.jwt}` }
		});
		expect(refreshRes.status).toBe(200);
		expect(oauthMocks.refreshAccessToken).toHaveBeenCalledWith('refresh-initial');
	});

	it('updates stored refreshToken when Google issues a rotated refresh_token', async () => {
		oauthMocks.getUserInfo.mockResolvedValue({
			id: 'user-123',
			email: 'dev@buk.cl',
			name: 'Dev User',
			picture: 'https://example.com/pic.png'
		});

		await adapter.saveSession({
			userId: 'user-123',
			email: 'dev@buk.cl',
			name: 'Dev User',
			picture: 'https://example.com/pic.png',
			refreshToken: 'refresh-old',
			createdAt: '2026-05-01T00:00:00.000Z',
			lastUsedAt: '2026-05-01T00:00:00.000Z'
		});

		oauthMocks.exchangeCode.mockResolvedValueOnce({
			access_token: 'access-new',
			refresh_token: 'refresh-rotated',
			expires_in: 3600,
			token_type: 'Bearer'
		});

		const res = await authRouter.request('/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'code-3', redirectUri: 'postmessage' })
		});
		expect(res.status).toBe(200);

		const updatedSession = await adapter.getSession('user-123');
		expect(updatedSession?.refreshToken).toBe('refresh-rotated');
		expect(updatedSession?.createdAt).toBe('2026-05-01T00:00:00.000Z');
	});
});
